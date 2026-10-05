import { allIndices, blockCount, highlight, i18nRef, RecordingTracer, scopeLevels, toHex, u8Regions, zeroSnapshot, type MacFunction, type RegionSpec, type Snapshot, type StateFacet } from '@cryventure/core';
import { hmacCallCompressions } from '../_lib/hmac/compressions.ts';
import { macDisplayName } from '../_lib/hmac/macCalls.ts';
import type { Pbkdf2OpName } from './manifest.ts';
import { int32be, pbkdf2Block } from './pbkdf2.ts';

/**
 * The traced PBKDF2 run (docs/M7.md §2e): per block `u1`, then `u` + `xor` per iteration, `block`;
 * finally `output`. Scopes `block → iteration`. With more than `SHOWN_ITERATIONS` iterations only
 * the first `LEADING_ITERATIONS` and the last are recorded, with one `skip` step (the real U and F
 * after iteration c − 1) in between.
 */
const NS = 'plugin.pbkdf2';

export type Pbkdf2Region = 'password' | 'salt' | 'u' | 'f' | 'dk';
type Pbkdf2Op = { op: Pbkdf2OpName };

/** Up to this many iterations every one is recorded. */
export const SHOWN_ITERATIONS = 8;
/** Above `SHOWN_ITERATIONS`, the iterations 1 … this one are recorded before the skip. */
export const LEADING_ITERATIONS = 3;

export const PBKDF2_SCOPE_LEVELS = scopeLevels(NS, 'block', 'iteration');

/** How iteration `j` of `iterations` is recorded: its own steps, the one `skip` step, or not at all. */
export type IterationRecording = 'shown' | 'skip' | 'hidden';

export function iterationRecording(j: number, iterations: number): IterationRecording {
  if (iterations <= SHOWN_ITERATIONS || j <= LEADING_ITERATIONS || j === iterations) return 'shown';
  return j === iterations - 1 ? 'skip' : 'hidden';
}

/** What a run derives from, all validated: the PRF (an HMAC `Mac` member) and its inputs. */
export interface Pbkdf2Input {
  mac: MacFunction;
  password: number[];
  salt: number[];
  iterations: number;
  length: number;
}

/** One recorded U_j: its iteration, bytes and state step (`skipped` for the skip step's U_{c−1}). */
export interface RecordedU {
  j: number;
  bytes: number[];
  step: number;
  skipped: boolean;
}

/** A block T_i (1-based `index`) with its recorded U chain and the step that writes it into DK. */
export interface RecordedBlock {
  index: number;
  us: RecordedU[];
  t: number[];
  step: number;
}

export interface Pbkdf2Recording {
  state: StateFacet<Pbkdf2Region, Pbkdf2Op>;
  blocks: RecordedBlock[];
  dk: number[];
  outputStep: number;
}

/** The regions; `password` and `salt` are omitted when empty (nothing to show). */
function regionSizes(input: Pbkdf2Input): Partial<Record<Pbkdf2Region, number>> {
  const { password, salt, mac, length } = input;
  return { ...(password.length > 0 ? { password: password.length } : {}), ...(salt.length > 0 ? { salt: salt.length } : {}), u: mac.outputSize, f: mac.outputSize, dk: length };
}

/** Zeros for u, f and dk; the password and salt regions (when present) hold their bytes from the start. */
function initialSnapshot(regions: RegionSpec<Pbkdf2Region>[], input: Pbkdf2Input): Snapshot<Pbkdf2Region> {
  const known: Partial<Record<Pbkdf2Region, number[]>> = { password: input.password, salt: input.salt };
  return Object.fromEntries(Object.entries(zeroSnapshot(regions)).map(([id, zeros]) => [id, known[id as Pbkdf2Region] ?? zeros])) as Snapshot<Pbkdf2Region>;
}

/** Bytes of the big-endian block index INT(i) appended to the salt in U1 (RFC 8018 §5.2). */
const BLOCK_INDEX_BYTES = 4;

/**
 * Total PRF calls l · c and the exact compressions they cost after the two midstates: per block, U1
 * hashes S ‖ INT(i) (more than one inner block for a long salt), U2 … Uc each a digest-long U.
 */
export function pbkdf2Cost(mac: MacFunction, saltBytes: number, blocks: number, iterations: number): { calls: number; compressions: number } {
  const perBlock = hmacCallCompressions(mac, saltBytes + BLOCK_INDEX_BYTES) + (iterations - 1) * hmacCallCompressions(mac, mac.outputSize);
  return { calls: blocks * iterations, compressions: blocks * perBlock };
}

class Pbkdf2Recorder {
  readonly tracer: RecordingTracer<Pbkdf2Region, Pbkdf2Op>;
  /** Display name of the PRF, e.g. `HMAC-SHA-256`. */
  private readonly macName: string;
  private readonly outputSize: number;

  constructor(private readonly input: Pbkdf2Input) {
    const regions = u8Regions(NS, regionSizes(input) as Record<Pbkdf2Region, number>, ['u', 'f', 'dk']);
    this.macName = macDisplayName(input.mac);
    this.outputSize = input.mac.outputSize;
    this.tracer = new RecordingTracer<Pbkdf2Region, Pbkdf2Op>(regions, initialSnapshot(regions, input), {
      initialNarration: i18nRef(`${NS}.step.initial`, {
        mac: this.macName,
        passwordBytes: input.password.length,
        saltBytes: input.salt.length,
        iterations: input.iterations,
        length: input.length,
        count: blockCount(input.length, this.outputSize),
      }),
    });
  }

  /** Records U_j (and F) of block `index` as its recording mode says; returns the recorded U, if any. */
  iteration(index: number, j: number, u: Uint8Array, f: Uint8Array): RecordedU | undefined {
    const mode = iterationRecording(j, this.input.iterations);
    if (mode === 'hidden') return undefined;
    const bytes = Array.from(u);
    this.tracer.enter(j - 1);
    if (j === 1) this.u1(index, bytes, Array.from(f));
    else if (mode === 'skip') this.skip(j, bytes, Array.from(f));
    else this.uAndXor(j, bytes, Array.from(f));
    this.tracer.leave();
    const step = this.tracer.stepCount - (mode === 'shown' && j > 1 ? 2 : 1);
    return { j, bytes, step, skipped: mode === 'skip' };
  }

  private u1(index: number, u: number[], f: number[]): void {
    const indices = allIndices(this.outputSize);
    this.tracer.step({
      op: 'u1',
      writes: [{ region: 'u', offset: 0, values: u }, { region: 'f', offset: 0, values: f }],
      highlights: [...this.inputReads('password'), ...this.inputReads('salt'), highlight('u', 'write', indices), highlight('f', 'write', indices)],
      narration: i18nRef(`${NS}.step.u1`, { block: index, counter: toHex(int32be(index)), mac: this.macName }),
    });
  }

  private uAndXor(j: number, u: number[], f: number[]): void {
    const indices = allIndices(this.outputSize);
    this.tracer.step({
      op: 'u',
      writes: [{ region: 'u', offset: 0, values: u }],
      highlights: [...this.inputReads('password'), highlight('u', 'write', indices)],
      narration: i18nRef(`${NS}.step.u`, { j, previous: j - 1, iterations: this.input.iterations }),
    });
    this.tracer.step({
      op: 'xor',
      writes: [{ region: 'f', offset: 0, values: f }],
      highlights: [highlight('u', 'read', indices), highlight('f', 'xor', indices)],
      narration: i18nRef(`${NS}.step.xor`, { j }),
    });
  }

  private skip(j: number, u: number[], f: number[]): void {
    const indices = allIndices(this.outputSize);
    this.tracer.step({
      op: 'skip',
      writes: [{ region: 'u', offset: 0, values: u }, { region: 'f', offset: 0, values: f }],
      highlights: [highlight('u', 'write', indices), highlight('f', 'write', indices)],
      narration: i18nRef(`${NS}.step.skip`, { first: LEADING_ITERATIONS + 1, last: j, hidden: j - LEADING_ITERATIONS }),
    });
  }

  /** A read of the whole password or salt, or none when it is empty (its region is omitted). */
  private inputReads(region: 'password' | 'salt') {
    const length = this.input[region].length;
    return length > 0 ? [highlight(region, 'read', allIndices(length))] : [];
  }

  /** Writes T_index (truncated for the last block) into DK at scope [index − 1]; returns the bytes written. */
  block(index: number, f: Uint8Array): number[] {
    const { outputSize } = this;
    const { length } = this.input;
    const offset = (index - 1) * outputSize;
    const t = Array.from(f.subarray(0, length - offset));
    this.tracer.step({
      op: 'block',
      writes: [{ region: 'dk', offset, values: t }],
      highlights: [highlight('f', 'read', allIndices(t.length)), highlight('dk', 'write', allIndices(t.length).map((k) => offset + k))],
      narration: t.length < outputSize ? i18nRef(`${NS}.step.blockTruncated`, { block: index, bytes: t.length, offset, size: outputSize }) : i18nRef(`${NS}.step.block`, { block: index, bytes: t.length, offset }),
    });
    return t;
  }

  output(blocks: number): void {
    const { calls, compressions } = pbkdf2Cost(this.input.mac, this.input.salt.length, blocks, this.input.iterations);
    this.tracer.step({
      op: 'output',
      writes: [],
      highlights: [highlight('dk', 'read', allIndices(this.input.length))],
      narration: i18nRef(`${NS}.step.output`, { length: this.input.length, count: blocks, iterations: this.input.iterations, calls, compressions, mac: this.macName }),
    });
  }
}

/** Runs PBKDF2 with the recorder attached: every value shown is the real one of this computation. */
export function recordPbkdf2(input: Pbkdf2Input): Pbkdf2Recording {
  const recorder = new Pbkdf2Recorder(input);
  const keyed = input.mac.create(Uint8Array.from(input.password));
  const salt = Uint8Array.from(input.salt);
  const blocks: RecordedBlock[] = [];
  const count = blockCount(input.length, input.mac.outputSize);
  for (let index = 1; index <= count; index++) {
    const us: RecordedU[] = [];
    recorder.tracer.enter(index - 1);
    const f = pbkdf2Block(keyed, salt, index, input.iterations, (j, u, running) => {
      const recorded = recorder.iteration(index, j, u, running);
      if (recorded !== undefined) us.push(recorded);
    });
    const t = recorder.block(index, f);
    recorder.tracer.leave();
    blocks.push({ index, us, t, step: recorder.tracer.stepCount - 1 });
  }
  recorder.output(count);
  return { state: { ...recorder.tracer.toFacet(), scopeLevels: PBKDF2_SCOPE_LEVELS }, blocks, dk: blocks.flatMap((block) => block.t), outputStep: recorder.tracer.stepCount - 1 };
}
