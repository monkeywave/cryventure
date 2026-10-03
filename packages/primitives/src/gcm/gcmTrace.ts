import {
  allIndices,
  BlockOpRecorder,
  blockCount,
  blockIndices,
  cipherName,
  GCM_FAST_IV_BYTES,
  GF128_BYTES,
  gf128Mul,
  highlight,
  i18nRef,
  inc32,
  toHex,
  u8Regions,
  xorBytesToArray,
  zeroSnapshot,
  type BlockCipher,
  type Highlight,
  type I18nRef,
  type ModeDirection,
  type RegionSpec,
  type Snapshot,
  type StateFacet,
  type Write,
} from '@cryventure/core';
import { j0GhashInputs, tagGhashInputs, type GhashInput } from './gcmBlocks.ts';
import type { GcmOpName } from './manifest.ts';

/**
 * Traced GCM (SP 800-38D §7): scope levels phase → op, with the phases setup (H, J0), ctr (GCTR over
 * the input), ghash (AAD, ciphertext, lengths) and tag (E_K(J0), MSB_t, and verify when decrypting).
 */
export type GcmRegion = 'iv' | 'aad' | 'plaintext' | 'ciphertext' | 'candidate' | 'h' | 'j0' | 'counter' | 'keystream' | 'x' | 'lengths' | 'tag' | 'receivedTag';
export type GcmOp = { op: GcmOpName };
export type GcmStateFacet = StateFacet<GcmRegion, GcmOp>;
type GcmRecorder = BlockOpRecorder<GcmRegion, GcmOp>;

const NS = 'plugin.gcm';

/** The phases, in order; a phase's index is its scope value. */
export const GCM_PHASES = ['setup', 'ctr', 'ghash', 'tag'] as const;
export type GcmPhase = (typeof GCM_PHASES)[number];
const phaseIndex = (phase: GcmPhase): number => GCM_PHASES.indexOf(phase);

export interface GcmRun {
  cipher: BlockCipher;
  key: Uint8Array;
  iv: number[];
  aad: number[];
  /** Plaintext when encrypting, ciphertext when decrypting. */
  input: number[];
  direction: ModeDirection;
  tagBytes: number;
  /** The received tag (decrypt only). */
  receivedTag: number[];
}

/** One GHASH multiply: Y = (before ⊕ block) • H, recorded at `step`. */
export interface GhashTrace extends GhashInput {
  before: number[];
  sum: number[];
  product: number[];
  step: number;
}

/** One GCTR block with the steps that produce its values. */
export interface GcmCtrBlock {
  /** CBᵢ = inc32(CBᵢ₋₁), CB₀ = J0. */
  counter: number[];
  keystream: number[];
  input: number[];
  output: number[];
  steps: { counter: number; cipher: number; xor: number };
}

export interface GcmRecording {
  facet: GcmStateFacet;
  run: GcmRun;
  h: number[];
  hashKeyStep: number;
  j0: number[];
  /** The step J0 is complete at (the last J0 GHASH step on the GHASH path). */
  j0Step: number;
  /** The J0 GHASH multiplies (empty for a 96-bit IV). */
  j0Ghash: GhashTrace[];
  blocks: GcmCtrBlock[];
  /** The tag GHASH multiplies over AAD, ciphertext and the length block; the last product is S. */
  ghash: GhashTrace[];
  s: number[];
  /** E_K(J0), the tag mask. */
  mask: number[];
  encryptJ0Step: number;
  /** MSB_t(S ⊕ E_K(J0)): the tag (encrypt) or the recomputed tag T′ (decrypt). */
  tag: number[];
  tagStep: number;
  /** Decrypt only: the verify step and whether the tags matched. */
  verify?: { step: number; authentic: boolean };
}

/** The bytes GCTR wrote: ciphertext when encrypting, the (possibly withheld) plaintext when decrypting. */
export function gcmCtrOutput(recording: Pick<GcmRecording, 'blocks'>): number[] {
  return recording.blocks.flatMap((block) => block.output);
}

/** The ciphertext GHASH authenticates: the GCTR output when encrypting, the input when decrypting. */
export function gcmCiphertext(recording: Pick<GcmRecording, 'blocks' | 'run'>): number[] {
  return recording.run.direction === 'encrypt' ? gcmCtrOutput(recording) : recording.run.input;
}

/**
 * The region holding the input (`plaintext` when encrypting) and the one GCTR writes. Decrypting,
 * GCTR writes the `candidate` plaintext: SP 800-38D §7.2 computes it before the tag check but may
 * release it only after T′ = T. The `plaintext` region stays blank until the verify step copies the
 * candidate into it (authentic); on FAIL it is never written and the candidate is wiped, so no zeros
 * pose as a real plaintext.
 */
export function ioRegions(direction: ModeDirection): { input: 'plaintext' | 'ciphertext'; output: 'ciphertext' | 'candidate' } {
  return direction === 'encrypt' ? { input: 'plaintext', output: 'ciphertext' } : { input: 'ciphertext', output: 'candidate' };
}

/** Region sizes in display order; empty AAD and input have no regions (decrypting: ciphertext, candidate, plaintext). */
export function gcmRegionSizes(run: GcmRun): Partial<Record<GcmRegion, number>> {
  const sizes: Partial<Record<GcmRegion, number>> = { iv: run.iv.length };
  if (run.aad.length > 0) sizes.aad = run.aad.length;
  const bytes = run.input.length;
  if (bytes > 0) Object.assign(sizes, run.direction === 'encrypt' ? { plaintext: bytes, ciphertext: bytes } : { ciphertext: bytes, candidate: bytes, plaintext: bytes });
  Object.assign(sizes, { h: GF128_BYTES, j0: GF128_BYTES, counter: GF128_BYTES, keystream: GF128_BYTES, x: GF128_BYTES, lengths: GF128_BYTES, tag: run.tagBytes });
  if (run.direction === 'decrypt') sizes.receivedTag = run.tagBytes;
  return sizes;
}

/** The regions (blank where the run writes the first value, or never; `x` starts as the real Y₀ = 0) and the initial snapshot. */
export function gcmRegions(run: GcmRun): { regions: RegionSpec<GcmRegion>[]; initial: Snapshot<GcmRegion> } {
  const io = ioRegions(run.direction);
  const sizes = gcmRegionSizes(run) as Record<GcmRegion, number>;
  const withheld: GcmRegion[] = run.direction === 'decrypt' ? ['plaintext'] : [];
  const regions = u8Regions<GcmRegion>(NS, sizes, [io.output, ...withheld, 'h', 'j0', 'counter', 'keystream', 'lengths', 'tag']);
  const given: Partial<Record<GcmRegion, number[]>> = { iv: run.iv, aad: run.aad, [io.input]: run.input, receivedTag: run.receivedTag };
  const initial: Record<string, readonly number[]> = { ...zeroSnapshot(regions) };
  for (const region of regions) {
    const values = given[region.id];
    if (values !== undefined) initial[region.id] = [...values];
  }
  return { regions, initial: initial as unknown as Snapshot<GcmRegion> };
}

function initialNarration(run: GcmRun): I18nRef {
  const params = { cipher: cipherName(run.cipher), aadBytes: run.aad.length, ivBytes: run.iv.length, tagBits: run.tagBytes * 8 };
  if (run.direction === 'decrypt') return i18nRef(`${NS}.step.initialDecrypt`, { ...params, bytes: run.input.length, tag: toHex(run.receivedTag) });
  if (run.input.length === 0) return i18nRef(`${NS}.step.initialGmac`, params);
  return i18nRef(`${NS}.step.initial`, { ...params, bytes: run.input.length });
}

/** Context shared by the phase recorders. */
interface Recording {
  recorder: GcmRecorder;
  run: GcmRun;
}

function encrypt(run: GcmRun, block: readonly number[]): number[] {
  return Array.from(run.cipher.encryptBlock(run.key, Uint8Array.from(block)));
}

function recordHashKey({ recorder, run }: Recording): { h: number[]; step: number } {
  const h = encrypt(run, new Array<number>(GF128_BYTES).fill(0));
  const step = recorder.op({
    op: 'hashKey',
    writes: [{ region: 'h', offset: 0, values: h }],
    highlights: [highlight('h', 'write', allIndices(GF128_BYTES))],
    narration: i18nRef(`${NS}.step.hashKey`, { cipher: cipherName(run.cipher), h: toHex(h) }),
  });
  return { h, step };
}

/** One GHASH multiply as a step: `target` ← (before ⊕ block) · H. */
interface GhashStepInput {
  op: GcmOpName;
  input: GhashInput;
  before: number[];
  h: number[];
  target: 'x' | 'j0';
  /** The region and offsets the block is read from (none for a length block). */
  read?: Highlight<GcmRegion>;
  extraWrites?: Write<GcmRegion>[];
  narration: (sum: number[], product: number[]) => I18nRef;
}

function recordGhashStep(recorder: GcmRecorder, input: GhashStepInput): GhashTrace {
  const sum = xorBytesToArray(input.before, input.input.block);
  const product = Array.from(gf128Mul(Uint8Array.from(sum), Uint8Array.from(input.h)));
  const step = recorder.op({
    op: input.op,
    writes: [...(input.extraWrites ?? []), { region: input.target, offset: 0, values: product }],
    highlights: [...(input.read === undefined ? [] : [input.read]), highlight('h', 'read', allIndices(GF128_BYTES)), highlight(input.target, 'write', allIndices(GF128_BYTES))],
    narration: input.narration(sum, product),
  });
  return { ...input.input, before: input.before, sum, product, step };
}

const ghashParams = (n: number, before: number[], block: number[], product: number[]) => ({ n, prev: n - 1, before: toHex(before), block: toHex(block), product: toHex(product) });

/** J0 = GHASH_H(IV ‖ 0^(s+64) ‖ [len(IV)]₆₄), one step per block, accumulated in the `j0` region. */
function recordJ0Ghash({ recorder, run }: Recording, h: number[]): GhashTrace[] {
  const inputs = j0GhashInputs(run.iv);
  const traces: GhashTrace[] = [];
  let before = new Array<number>(GF128_BYTES).fill(0);
  inputs.forEach((input, index) => {
    const isLength = input.source === 'ivLength';
    const trace = recordGhashStep(recorder, {
      op: 'j0',
      input,
      before,
      h,
      target: 'j0',
      ...(isLength ? { extraWrites: [{ region: 'lengths', offset: 0, values: input.block }] } : { read: highlight('iv', 'read', blockIndices(input.index, GF128_BYTES, run.iv.length)) }),
      narration: (_, product) =>
        i18nRef(`${NS}.step.${isLength ? 'j0GhashLength' : 'j0Ghash'}`, { ...ghashParams(index + 1, before, input.block, product), count: inputs.length, ivBits: run.iv.length * 8 }),
    });
    traces.push(trace);
    before = trace.product;
  });
  return traces;
}

function recordJ0(context: Recording, h: number[]): { j0: number[]; step: number; ghash: GhashTrace[] } {
  const { recorder, run } = context;
  if (run.iv.length !== GCM_FAST_IV_BYTES) {
    const ghash = recordJ0Ghash(context, h);
    const last = ghash[ghash.length - 1]!;
    return { j0: last.product, step: last.step, ghash };
  }
  const j0 = [...run.iv, 0, 0, 0, 1];
  const step = recorder.op({
    op: 'j0',
    writes: [{ region: 'j0', offset: 0, values: j0 }],
    highlights: [highlight('iv', 'read', allIndices(run.iv.length)), highlight('j0', 'write', allIndices(GF128_BYTES))],
    narration: i18nRef(`${NS}.step.j0Fast`, { iv: toHex(run.iv), j0: toHex(j0) }),
  });
  return { j0, step, ghash: [] };
}

function recordInc32(recorder: GcmRecorder, index: number, counter: number[]): number {
  const first = index === 0;
  return recorder.op({
    op: 'inc32',
    writes: [{ region: 'counter', offset: 0, values: counter }],
    highlights: [highlight(first ? 'j0' : 'counter', 'read', allIndices(GF128_BYTES)), highlight('counter', 'write', allIndices(GF128_BYTES))],
    narration: first ? i18nRef(`${NS}.step.inc32First`, { counter: toHex(counter) }) : i18nRef(`${NS}.step.inc32`, { n: index + 1, prev: index, counter: toHex(counter) }),
  });
}

/** Encrypting, the narration shows the ciphertext block; decrypting, the candidate plaintext is held back (no `output`). */
function xorNarration(direction: ModeDirection, index: number, input: number[], keystream: number[], output: number[]): I18nRef {
  const withheld = direction === 'decrypt';
  const key = `${NS}.step.xorKeystream${withheld ? 'Withheld' : ''}`;
  const params = { n: index + 1, input: toHex(input), keystream: toHex(keystream.slice(0, input.length)), ...(withheld ? {} : { output: toHex(output) }) };
  if (input.length === GF128_BYTES) return i18nRef(key, params);
  return i18nRef(`${key}Partial`, { ...params, used: input.length, unused: GF128_BYTES - input.length });
}

/** One GCTR block: CBᵢ = inc32(CBᵢ₋₁), E_K(CBᵢ), then output = input ⊕ keystream (truncated). */
function recordCtrBlock({ recorder, run }: Recording, index: number, counter: number[]): GcmCtrBlock {
  const io = ioRegions(run.direction);
  const counterStep = recordInc32(recorder, index, counter);
  const keystream = encrypt(run, counter);
  const cipherStep = recorder.op({
    op: 'encryptCounter',
    writes: [{ region: 'keystream', offset: 0, values: keystream }],
    highlights: [highlight('counter', 'read', allIndices(GF128_BYTES)), highlight('keystream', 'write', allIndices(GF128_BYTES))],
    narration: i18nRef(`${NS}.step.encryptCounter`, { n: index + 1, cipher: cipherName(run.cipher), counter: toHex(counter), keystream: toHex(keystream) }),
  });
  const indices = blockIndices(index, GF128_BYTES, run.input.length);
  const input = run.input.slice(indices[0], (indices[0] ?? 0) + indices.length);
  const output = xorBytesToArray(input, keystream.slice(0, input.length));
  const xor = recorder.op({
    op: 'xorKeystream',
    writes: [{ region: io.output, offset: index * GF128_BYTES, values: output }],
    highlights: [highlight(io.input, 'read', indices), highlight('keystream', 'read', allIndices(input.length)), highlight(io.output, 'xor', indices)],
    narration: xorNarration(run.direction, index, input, keystream, output),
  });
  return { counter, keystream, input, output, steps: { counter: counterStep, cipher: cipherStep, xor } };
}

function recordCtrPhase(context: Recording, j0: number[]): GcmCtrBlock[] {
  let counter = j0;
  return allIndices(blockCount(context.run.input.length, GF128_BYTES)).map((index) => {
    counter = Array.from(inc32(Uint8Array.from(counter)));
    return recordCtrBlock(context, index, counter);
  });
}

function tagGhashNarration(input: GhashInput, n: number, before: number[], product: number[], run: GcmRun, ciphertextBytes: number): I18nRef {
  const params = ghashParams(n, before, input.block, product);
  if (input.source === 'length') return i18nRef(`${NS}.step.lengthBlock`, { ...params, aadBits: run.aad.length * 8, ciphertextBits: ciphertextBytes * 8 });
  const partial = input.data.length < GF128_BYTES ? 'Partial' : '';
  const source = input.source === 'aad' ? 'ghashAad' : 'ghashCiphertext';
  return i18nRef(`${NS}.step.${source}${partial}`, { ...params, index: input.index + 1, ...(partial ? { used: input.data.length, zeros: GF128_BYTES - input.data.length } : {}) });
}

function ghashRead(input: GhashInput, ciphertextLength: number, aadLength: number): Highlight<GcmRegion> | undefined {
  if (input.source === 'aad') return highlight('aad', 'read', blockIndices(input.index, GF128_BYTES, aadLength));
  if (input.source === 'ciphertext') return highlight('ciphertext', 'read', blockIndices(input.index, GF128_BYTES, ciphertextLength));
  return undefined;
}

/** S = GHASH_H(A ‖ 0^v ‖ C ‖ 0^u ‖ [len(A)]₆₄ ‖ [len(C)]₆₄), one step per block, accumulated in `x`. */
function recordGhashPhase({ recorder, run }: Recording, h: number[], ciphertext: number[]): GhashTrace[] {
  const traces: GhashTrace[] = [];
  let before = new Array<number>(GF128_BYTES).fill(0);
  tagGhashInputs(run.aad, ciphertext).forEach((input, index) => {
    const isLength = input.source === 'length';
    const read = ghashRead(input, ciphertext.length, run.aad.length);
    const trace = recordGhashStep(recorder, {
      op: isLength ? 'lengthBlock' : 'ghashBlock',
      input,
      before,
      h,
      target: 'x',
      ...(read === undefined ? {} : { read }),
      ...(isLength ? { extraWrites: [{ region: 'lengths', offset: 0, values: input.block }] } : {}),
      narration: (_, product) => tagGhashNarration(input, index + 1, before, product, run, ciphertext.length),
    });
    traces.push(trace);
    before = trace.product;
  });
  return traces;
}

function recordEncryptJ0({ recorder, run }: Recording, j0: number[]): { mask: number[]; step: number } {
  const mask = encrypt(run, j0);
  const step = recorder.op({
    op: 'encryptJ0',
    writes: [{ region: 'keystream', offset: 0, values: mask }],
    highlights: [highlight('j0', 'read', allIndices(GF128_BYTES)), highlight('keystream', 'write', allIndices(GF128_BYTES))],
    narration: i18nRef(`${NS}.step.encryptJ0`, { cipher: cipherName(run.cipher), j0: toHex(j0), mask: toHex(mask) }),
  });
  return { mask, step };
}

function tagNarration(run: GcmRun, full: number[], tag: number[], s: number[], mask: number[]): I18nRef {
  const key = `${NS}.step.${run.direction === 'decrypt' ? 'tagRecomputed' : 'tag'}`;
  const params = { s: toHex(s), mask: toHex(mask), tag: toHex(tag) };
  if (run.tagBytes === GF128_BYTES) return i18nRef(key, params);
  return i18nRef(`${key}Truncated`, { ...params, full: toHex(full), tagBytes: run.tagBytes, tagBits: run.tagBytes * 8 });
}

function recordTag({ recorder, run }: Recording, s: number[], mask: number[]): { tag: number[]; step: number } {
  const full = xorBytesToArray(s, mask);
  const tag = full.slice(0, run.tagBytes);
  const step = recorder.op({
    op: 'tag',
    writes: [{ region: 'tag', offset: 0, values: tag }],
    highlights: [highlight('x', 'read', allIndices(GF128_BYTES)), highlight('keystream', 'read', allIndices(GF128_BYTES)), highlight('tag', 'xor', allIndices(run.tagBytes))],
    narration: tagNarration(run, full, tag, s, mask),
  });
  return { tag, step };
}

/**
 * Compares every byte (no early exit), like the core reference. A copy of core's private `tagsEqual`:
 * core is frozen (docs/M4.md §0), so the plugin keeps its own.
 */
export function tagsMatch(a: readonly number[], b: readonly number[]): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

/** Authentic: the candidate is released into `plaintext`. FAIL: the candidate is wiped and `plaintext` stays blank. */
function verifyEffects(authentic: boolean, candidate: number[]): { writes: Write<GcmRegion>[]; highlights: Highlight<GcmRegion>[] } {
  if (candidate.length === 0) return { writes: [], highlights: [] };
  const all = allIndices(candidate.length);
  if (authentic) return { writes: [{ region: 'plaintext', offset: 0, values: candidate }], highlights: [highlight('candidate', 'read', all), highlight('plaintext', 'write', all)] };
  return { writes: [{ region: 'candidate', offset: 0, values: new Array<number>(candidate.length).fill(0) }], highlights: [highlight('candidate', 'write', all)] };
}

/** Decrypt: T′ = T releases the candidate plaintext; otherwise FAIL discards it (docs/M4.md §2b, SP 800-38D §7.2). */
function recordVerify({ recorder, run }: Recording, tag: number[], candidate: number[]): { step: number; authentic: boolean } {
  const authentic = tagsMatch(tag, run.receivedTag);
  const effects = verifyEffects(authentic, candidate);
  const step = recorder.op({
    op: 'verify',
    writes: effects.writes,
    highlights: [highlight('tag', 'read', allIndices(run.tagBytes)), highlight('receivedTag', 'read', allIndices(run.tagBytes)), ...effects.highlights],
    narration: i18nRef(`${NS}.step.${authentic ? 'verifyOk' : 'verifyFail'}`, { computed: toHex(tag), received: toHex(run.receivedTag) }),
  });
  return { step, authentic };
}

type TagPhase = Pick<GcmRecording, 'mask' | 'encryptJ0Step' | 'tag' | 'tagStep' | 'verify'>;

function recordTagPhase(context: Recording, j0: number[], s: number[], candidate: number[]): TagPhase {
  const encryptJ0 = recordEncryptJ0(context, j0);
  const tag = recordTag(context, s, encryptJ0.mask);
  const phase: TagPhase = { mask: encryptJ0.mask, encryptJ0Step: encryptJ0.step, tag: tag.tag, tagStep: tag.step };
  if (context.run.direction === 'decrypt') phase.verify = recordVerify(context, tag.tag, candidate);
  return phase;
}

/** Records GCM over `run`: the four phases, each its own scope (an empty phase records no step). */
export function recordGcm(run: GcmRun): GcmRecording {
  const { regions, initial } = gcmRegions(run);
  const recorder: GcmRecorder = new BlockOpRecorder(regions, initial, initialNarration(run));
  const context: Recording = { recorder, run };
  const phase = <T>(name: GcmPhase, body: () => T): T => recorder.block(phaseIndex(name), body);
  const setup = phase('setup', () => {
    const hashKey = recordHashKey(context);
    return { hashKey, j0: recordJ0(context, hashKey.h) };
  });
  const { h } = setup.hashKey;
  const { j0 } = setup.j0;
  const blocks = phase('ctr', () => recordCtrPhase(context, j0));
  const ciphertext = gcmCiphertext({ blocks, run });
  const ghash = phase('ghash', () => recordGhashPhase(context, h, ciphertext));
  const s = ghash[ghash.length - 1]!.product;
  const tag = phase('tag', () => recordTagPhase(context, j0, s, gcmCtrOutput({ blocks })));
  return { facet: recorder.toFacet(), run, h, hashKeyStep: setup.hashKey.step, j0, j0Step: setup.j0.step, j0Ghash: setup.j0.ghash, blocks, ghash, s, ...tag };
}
