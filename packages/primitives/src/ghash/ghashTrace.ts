import {
  allIndices,
  GF128_BITS,
  GF128_BYTES,
  GF128_R_FIRST_BYTE,
  gf128Mul,
  gf128MulSteps,
  highlight,
  i18nRef,
  scopeLevels,
  toHex,
  u8Regions,
  xorBytesToArray,
  zeroSnapshot,
  type FieldTerm,
  type Gf128MulStep,
  type I18nRef,
  type Snapshot,
  type StateFacet,
} from '@cryventure/core';
import { FieldPairedRecorder, type FieldContent } from './fieldRecorder.ts';
import type { GhashDetail, GhashOpName } from './manifest.ts';

/**
 * Traced GHASH (SP 800-38D §6.4): per block i a scope holding `xorBlock` (X = Yᵢ₋₁ ⊕ Bᵢ) and then
 * either one `multiply` (Yᵢ = X • H, detail `block`) or a `multiply` scope with the 128 Algorithm 1
 * iterations as `mulBit` steps (detail `bit`), the last of which writes Yᵢ = Z₁₂₈.
 */
export type GhashRegion = 'h' | 'block' | 'x' | 'z' | 'v';
export type GhashOp = { op: GhashOpName };
export type GhashStateFacet = StateFacet<GhashRegion, GhashOp>;
type GhashRecorder = FieldPairedRecorder<GhashRegion, GhashOp>;

export const NS = 'plugin.ghash';
/** The last bit of V (GCM order): when it is 1, V >> 1 is reduced by R. */
export const V_REDUCTION_BIT = GF128_BITS - 1;
/** R = 11100001 ‖ 0¹²⁰ as bytes. */
export const R_BYTES: readonly number[] = [GF128_R_FIRST_BYTE, ...new Array<number>(GF128_BYTES - 1).fill(0)];

export interface GhashRecording {
  state: GhashStateFacet;
  field: ReturnType<GhashRecorder['fieldFacet']>;
  /** Y₁ … Yₘ; the last one is GHASH_H(input). */
  ys: number[][];
}

/** Bit positions (GCM order: 0 = MSB of byte 0) that are 1 in `bytes`. */
export function setBitsGcm(bytes: readonly number[]): number[] {
  return allIndices(bytes.length * 8).filter((bit) => ((bytes[bit >> 3] ?? 0) >> (7 - (bit & 7))) & 1);
}

/** A field term labelled `plugin.ghash.term.<labelId>` with `labelParams`. */
export function fieldTerm(id: string, labelId: string, labelParams: Record<string, number>, bytes: readonly number[], role: FieldTerm['role'], extra: Pick<FieldTerm, 'op' | 'bits'> = {}): FieldTerm {
  return { id, label: i18nRef(`${NS}.term.${labelId}`, labelParams), bytes: [...bytes], role, ...extra };
}

function regionsFor(detail: GhashDetail) {
  const shapes = detail === 'bit' ? { h: GF128_BYTES, block: GF128_BYTES, x: GF128_BYTES, z: GF128_BYTES, v: GF128_BYTES } : { h: GF128_BYTES, block: GF128_BYTES, x: GF128_BYTES };
  return u8Regions<GhashRegion>(NS, shapes as Record<GhashRegion, number>, ['block', 'z', 'v']);
}

function levelsFor(detail: GhashDetail) {
  return detail === 'bit' ? scopeLevels(NS, 'block', 'op', 'iteration') : scopeLevels(NS, 'block', 'op');
}

function initialNarration(h: readonly number[], blockCount: number, detail: GhashDetail): I18nRef {
  return i18nRef(`${NS}.step.initial.${detail}`, { count: blockCount, h: toHex(h) });
}

function initialField(h: readonly number[]): FieldContent {
  return {
    formula: i18nRef(`${NS}.formula.ghash`),
    terms: [fieldTerm('h', 'h', {}, h, 'operand'), fieldTerm('y0', 'y', { n: 0 }, new Array<number>(GF128_BYTES).fill(0), 'operand')],
  };
}

function createRecorder(h: readonly number[], blockCount: number, detail: GhashDetail): GhashRecorder {
  const regions = regionsFor(detail);
  const initial = { ...zeroSnapshot(regions), h: [...h] } as Snapshot<GhashRegion>;
  return new FieldPairedRecorder<GhashRegion, GhashOp>(regions, initial, levelsFor(detail), { narration: initialNarration(h, blockCount, detail), field: initialField(h) });
}

/** X = Yᵢ₋₁ ⊕ Bᵢ into `x`; no field step (the field facet starts each block at its multiply). */
function recordXor(recorder: GhashRecorder, index: number, y: readonly number[], block: readonly number[]): number[] {
  const x = xorBytesToArray(y, block);
  const all = allIndices(GF128_BYTES);
  recorder.scopedStep({
    op: 'xorBlock',
    writes: [{ region: 'block', offset: 0, values: [...block] }, { region: 'x', offset: 0, values: x }],
    highlights: [highlight('block', 'write', all), highlight('x', 'xor', all)],
    narration: i18nRef(`${NS}.step.xorBlock`, { n: index + 1, prev: index, y: toHex(y), block: toHex(block), x: toHex(x) }),
  });
  return x;
}

/** Detail `block`: Yᵢ = X • H as one step and one field step. */
function recordMultiply(recorder: GhashRecorder, index: number, x: readonly number[], h: readonly number[], product: readonly number[]): void {
  const n = index + 1;
  const all = allIndices(GF128_BYTES);
  recorder.scopedStep(
    {
      op: 'multiply',
      writes: [{ region: 'x', offset: 0, values: [...product] }],
      highlights: [highlight('h', 'read', all), highlight('x', 'write', all)],
      narration: i18nRef(`${NS}.step.multiply`, { n, x: toHex(x), h: toHex(h), y: toHex(product) }),
    },
    {
      formula: i18nRef(`${NS}.formula.multiply`, { n, prev: index }),
      terms: [
        fieldTerm('x', 'x', { n, prev: index }, x, 'operand'),
        fieldTerm('h', 'h', {}, h, 'operand', { op: 'mul' }),
        fieldTerm('y', 'y', { n }, product, 'result', { op: 'result' }),
      ],
    },
  );
}

/** The narration/formula variant of one iteration: add (xᵢ = 1) or skip, reduce (V's last bit = 1) or shift. */
export function iterationVariant(step: Pick<Gf128MulStep, 'xBit' | 'reduced'>): string {
  return `${step.xBit ? 'add' : 'skip'}${step.reduced ? 'Reduce' : 'Shift'}`;
}

interface Iteration {
  step: Gf128MulStep;
  /** Zᵢ and Vᵢ before the iteration. */
  zBefore: number[];
  vBefore: number[];
  last: boolean;
}

function iterationField(index: number, x: readonly number[], iteration: Iteration): FieldContent {
  const { step, zBefore, vBefore, last } = iteration;
  const i = step.bit;
  const terms: FieldTerm[] = [
    fieldTerm('x', 'x', { n: index + 1, prev: index }, x, 'operand', { op: 'select', bits: [i] }),
    fieldTerm('zBefore', 'z', { i }, zBefore, 'intermediate'),
    fieldTerm('vBefore', 'v', { i }, vBefore, 'intermediate', { bits: [V_REDUCTION_BIT], ...(step.xBit ? { op: 'xor' as const } : {}) }),
    fieldTerm('z', 'z', { i: i + 1 }, Array.from(step.z), last ? 'result' : 'intermediate'),
    ...(step.reduced ? [fieldTerm('r', 'r', {}, R_BYTES, 'constant', { op: 'reduce', bits: setBitsGcm(R_BYTES) })] : []),
    fieldTerm('v', 'v', { i: i + 1 }, Array.from(step.v), 'intermediate', { op: 'shift' }),
  ];
  return { formula: i18nRef(`${NS}.formula.mulBit.${iterationVariant(step)}`, { i, next: i + 1 }), terms };
}

function iterationNarration(index: number, iteration: Iteration): I18nRef {
  const { step, last } = iteration;
  const z = toHex(step.z);
  if (last) return i18nRef(`${NS}.step.mulBitLast.${step.xBit ? 'add' : 'skip'}`, { n: index + 1, i: step.bit, next: step.bit + 1, z });
  return i18nRef(`${NS}.step.mulBit.${iterationVariant(step)}`, { i: step.bit, z, v: toHex(step.v) });
}

function recordIteration(recorder: GhashRecorder, index: number, x: readonly number[], iteration: Iteration): void {
  const { step, last } = iteration;
  const all = allIndices(GF128_BYTES);
  const z = Array.from(step.z);
  recorder.scopedStep(
    {
      op: 'mulBit',
      writes: [{ region: 'z', offset: 0, values: z }, { region: 'v', offset: 0, values: Array.from(step.v) }, ...(last ? [{ region: 'x' as const, offset: 0, values: z }] : [])],
      highlights: [
        highlight('x', 'read', [step.bit >> 3]),
        highlight('z', step.xBit ? 'xor' : 'read', all),
        highlight('v', step.reduced ? 'carry' : 'move', all),
        ...(last ? [highlight('x', 'write', all)] : []),
      ],
      narration: iterationNarration(index, iteration),
    },
    iterationField(index, x, iteration),
    step.bit,
  );
}

/** Detail `bit`: a `multiply` scope with Algorithm 1's 128 iterations (Z₀ = 0, V₀ = H). */
function recordIterations(recorder: GhashRecorder, index: number, x: readonly number[], h: readonly number[]): number[] {
  const explained = gf128MulSteps(Uint8Array.from(x), Uint8Array.from(h));
  let zBefore = new Array<number>(GF128_BYTES).fill(0);
  let vBefore = [...h];
  recorder.enter();
  explained.steps.forEach((step, position) => {
    recordIteration(recorder, index, x, { step, zBefore, vBefore, last: position === explained.steps.length - 1 });
    zBefore = Array.from(step.z);
    vBefore = Array.from(step.v);
  });
  recorder.leave();
  return Array.from(explained.result);
}

/** Records GHASH_H over `blocks` (each 16 bytes) at the given detail. */
export function recordGhash(h: readonly number[], blocks: readonly (readonly number[])[], detail: GhashDetail): GhashRecording {
  const recorder = createRecorder(h, blocks.length, detail);
  const ys: number[][] = [];
  let y = new Array<number>(GF128_BYTES).fill(0);
  blocks.forEach((block, index) => {
    recorder.enter(index);
    const x = recordXor(recorder, index, y, block);
    if (detail === 'bit') y = recordIterations(recorder, index, x, h);
    else {
      y = Array.from(gf128Mul(Uint8Array.from(x), Uint8Array.from(h)));
      recordMultiply(recorder, index, x, h, y);
    }
    recorder.leave();
    ys.push(y);
  });
  return { state: recorder.stateFacet(), field: recorder.fieldFacet(), ys };
}
