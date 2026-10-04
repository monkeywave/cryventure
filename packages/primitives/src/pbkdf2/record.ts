import { allIndices, i18nRef, RecordingTracer, scopeLevels, toHex, type MacContext, type RegionSpec, type StateFacet } from '@cryventure/core';
import type { Pbkdf2OpName } from './manifest.ts';
import { blockCount, int32be, pbkdf2Block } from './pbkdf2.ts';

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

/** What a run derives from, all validated; `keyed` is the Mac context keyed once with the password. */
export interface Pbkdf2Input {
  /** Display name of the PRF, e.g. `HMAC-SHA-256`. */
  macName: string;
  outputSize: number;
  keyed: MacContext;
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
function regions(input: Pbkdf2Input): RegionSpec<Pbkdf2Region>[] {
  const region = (id: Pbkdf2Region, size: number, blank: boolean): RegionSpec<Pbkdf2Region> => ({
    id,
    labelKey: `${NS}.region.${id}`,
    elem: 'u8',
    shape: [size],
    ...(blank ? { initial: 'blank' as const } : {}),
  });
  return [
    ...(input.password.length > 0 ? [region('password', input.password.length, false)] : []),
    ...(input.salt.length > 0 ? [region('salt', input.salt.length, false)] : []),
    region('u', input.outputSize, true),
    region('f', input.outputSize, true),
    region('dk', input.length, true),
  ];
}

function initialSnapshot(input: Pbkdf2Input, specs: RegionSpec<Pbkdf2Region>[]): Partial<Record<Pbkdf2Region, number[]>> {
  const zeros = (size: number) => new Array<number>(size).fill(0);
  const values: Record<Pbkdf2Region, number[]> = {
    password: input.password,
    salt: input.salt,
    u: zeros(input.outputSize),
    f: zeros(input.outputSize),
    dk: zeros(input.length),
  };
  return Object.fromEntries(specs.map((spec) => [spec.id, values[spec.id]]));
}

/** Total PRF calls l · c and the compressions they cost after the two midstates (2 per call). */
export function pbkdf2Cost(blocks: number, iterations: number): { calls: number; compressions: number } {
  const calls = blocks * iterations;
  return { calls, compressions: 2 * calls };
}

class Pbkdf2Recorder {
  readonly tracer: RecordingTracer<Pbkdf2Region, Pbkdf2Op>;
  private readonly hasPassword: boolean;
  private readonly hasSalt: boolean;

  constructor(private readonly input: Pbkdf2Input) {
    const specs = regions(input);
    this.hasPassword = input.password.length > 0;
    this.hasSalt = input.salt.length > 0;
    this.tracer = new RecordingTracer<Pbkdf2Region, Pbkdf2Op>(specs, initialSnapshot(input, specs) as Record<Pbkdf2Region, number[]>, {
      initialNarration: i18nRef(`${NS}.step.initial`, {
        mac: input.macName,
        passwordBytes: input.password.length,
        saltBytes: input.salt.length,
        iterations: input.iterations,
        length: input.length,
        count: blockCount(input.length, input.outputSize),
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
    const size = this.input.outputSize;
    this.tracer.step({
      op: 'u1',
      writes: [{ region: 'u', offset: 0, values: u }, { region: 'f', offset: 0, values: f }],
      highlights: [...this.keyReads(), ...(this.hasSalt ? [{ region: 'salt' as const, indices: allIndices(this.input.salt.length), kind: 'read' as const }] : []), { region: 'u', indices: allIndices(size), kind: 'write' }, { region: 'f', indices: allIndices(size), kind: 'write' }],
      narration: i18nRef(`${NS}.step.u1`, { block: index, counter: toHex(int32be(index)), mac: this.input.macName }),
    });
  }

  private uAndXor(j: number, u: number[], f: number[]): void {
    const indices = allIndices(this.input.outputSize);
    this.tracer.step({
      op: 'u',
      writes: [{ region: 'u', offset: 0, values: u }],
      highlights: [...this.keyReads(), { region: 'u', indices, kind: 'write' }],
      narration: i18nRef(`${NS}.step.u`, { j, previous: j - 1, iterations: this.input.iterations }),
    });
    this.tracer.step({
      op: 'xor',
      writes: [{ region: 'f', offset: 0, values: f }],
      highlights: [{ region: 'u', indices, kind: 'read' }, { region: 'f', indices, kind: 'xor' }],
      narration: i18nRef(`${NS}.step.xor`, { j }),
    });
  }

  private skip(j: number, u: number[], f: number[]): void {
    const indices = allIndices(this.input.outputSize);
    this.tracer.step({
      op: 'skip',
      writes: [{ region: 'u', offset: 0, values: u }, { region: 'f', offset: 0, values: f }],
      highlights: [{ region: 'u', indices, kind: 'write' }, { region: 'f', indices, kind: 'write' }],
      narration: i18nRef(`${NS}.step.skip`, { first: LEADING_ITERATIONS + 1, last: j, hidden: j - LEADING_ITERATIONS }),
    });
  }

  private keyReads() {
    return this.hasPassword ? [{ region: 'password' as const, indices: allIndices(this.input.password.length), kind: 'read' as const }] : [];
  }

  /** Writes T_index (truncated for the last block) into DK at scope [index − 1]; returns the bytes written. */
  block(index: number, f: Uint8Array): number[] {
    const { outputSize, length } = this.input;
    const offset = (index - 1) * outputSize;
    const t = Array.from(f.subarray(0, length - offset));
    this.tracer.step({
      op: 'block',
      writes: [{ region: 'dk', offset, values: t }],
      highlights: [{ region: 'f', indices: allIndices(t.length), kind: 'read' }, { region: 'dk', indices: allIndices(t.length).map((k) => offset + k), kind: 'write' }],
      narration: t.length < outputSize ? i18nRef(`${NS}.step.blockTruncated`, { block: index, bytes: t.length, offset, size: outputSize }) : i18nRef(`${NS}.step.block`, { block: index, bytes: t.length, offset }),
    });
    return t;
  }

  output(blocks: number): void {
    const { calls, compressions } = pbkdf2Cost(blocks, this.input.iterations);
    this.tracer.step({
      op: 'output',
      writes: [],
      highlights: [{ region: 'dk', indices: allIndices(this.input.length), kind: 'read' }],
      narration: i18nRef(`${NS}.step.output`, { length: this.input.length, count: blocks, iterations: this.input.iterations, calls, compressions, mac: this.input.macName }),
    });
  }
}

/** Runs PBKDF2 with the recorder attached: every value shown is the real one of this computation. */
export function recordPbkdf2(input: Pbkdf2Input): Pbkdf2Recording {
  const recorder = new Pbkdf2Recorder(input);
  const salt = Uint8Array.from(input.salt);
  const blocks: RecordedBlock[] = [];
  const count = blockCount(input.length, input.outputSize);
  for (let index = 1; index <= count; index++) {
    const us: RecordedU[] = [];
    recorder.tracer.enter(index - 1);
    const f = pbkdf2Block(input.keyed, salt, index, input.iterations, (j, u, running) => {
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
