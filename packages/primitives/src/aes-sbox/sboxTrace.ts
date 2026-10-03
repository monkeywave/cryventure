import {
  affineSteps,
  AFFINE_CONSTANT,
  braceHex,
  ginvSteps,
  ginvStepTerms,
  highlight,
  i18nRef,
  mathTerm,
  PairedRecorder,
  scopeLevels,
  singleCellRegion,
  type AffineBitStep,
  type GinvStep,
  type Highlight,
  type I18nRef,
  type InitialContent,
  type MathFacet,
  type MathTerm,
  type MathTermOptions,
  type StateFacet,
} from '@cryventure/core';
import type { AesSboxOpName } from './manifest.ts';

/**
 * Records the S-box derivation of one byte x (FIPS 197 §5.1.1): S(x) = affine(x⁻¹).
 * Every state step gets a matching math step (same index), so the state and math facets stay in sync.
 */
export type SboxRegion = 'input' | 'inverse' | 'constant' | 'output';
export type SboxOp = { op: AesSboxOpName };
export type SboxStateFacet = StateFacet<SboxRegion, SboxOp>;

const NS = 'plugin.aes-sbox';
const BYTE_WIDTH = 8;

/** Phases (outermost scope level): inversion, affine map. The input x is the initial state (step −1). */
export const PHASE = { inversion: 0, affine: 1 } as const;

/** One byte per region; the input x and the affine constant are known up front, every other byte is a placeholder until a step computes it. */
const SBOX_REGIONS = (['input', 'inverse', 'constant', 'output'] as const).map((id) =>
  singleCellRegion(NS, id, { order: 'row-major', blank: id === 'inverse' || id === 'output' }),
);

/** A byte term (`width` overrides 8 for a single bit). */
function term(id: string, label: I18nRef, value: number, role: MathTerm['role'], { width = BYTE_WIDTH, ...options }: MathTermOptions & { width?: number } = {}): MathTerm {
  return mathTerm(id, label, value, width, role, options);
}

const xTerm = (x: number, options: MathTermOptions = {}): MathTerm => term('x', i18nRef(`${NS}.term.x`), x, 'operand', options);
const powerLabel = (exp: number): I18nRef => i18nRef(`${NS}.term.power`, { exp });

interface SboxStep {
  op: AesSboxOpName;
  region: SboxRegion;
  value: number;
  highlights: Highlight<SboxRegion>[];
  narration: I18nRef;
  formula: I18nRef;
  terms: MathTerm[];
}

type SboxRecorder = PairedRecorder<SboxRegion, SboxOp>;

/** The initial state holds x (narrated at step −1, with its math) and the affine constant. */
function sboxRecorder(x: number): SboxRecorder {
  const initial = { input: [x], inverse: [0], constant: [AFFINE_CONSTANT], output: [0] };
  return new PairedRecorder<SboxRegion, SboxOp>(SBOX_REGIONS, initial, scopeLevels(NS, 'phase', 'op'), initialContent(x));
}

/** One op-level state step (own scope) plus its math step. */
function emit(recorder: SboxRecorder, { op, region, value, highlights, narration, formula, terms }: SboxStep): void {
  recorder.scopedStep({ op, writes: [{ region, offset: 0, values: [value] }], highlights, narration }, { formula, terms });
}

function inPhase(recorder: SboxRecorder, index: number, body: () => void): void {
  recorder.enter(index);
  body();
  recorder.leave();
}

function initialContent(x: number): InitialContent {
  const narrationKey = x === 0 ? 'loadZero' : 'load';
  return {
    narration: i18nRef(`${NS}.step.${narrationKey}`, { x: braceHex(x) }),
    math: { formula: i18nRef(`${NS}.math.load`, { x: braceHex(x) }), terms: [xTerm(x)] },
  };
}

function powerStep(x: number, step: GinvStep): SboxStep {
  const isSquare = step.op === 'square';
  const params = { exp: step.exponent, previous: step.previousExponent };
  return {
    op: isSquare ? 'square' : 'multiply',
    region: 'inverse',
    value: step.value,
    highlights: isSquare ? [highlight('inverse', 'write')] : [highlight('input', 'read'), highlight('inverse', 'write')],
    narration: i18nRef(`${NS}.step.${step.op}`, { exp: step.exponent, value: braceHex(step.value) }),
    formula: i18nRef(`${NS}.math.${step.op}`, params),
    terms: ginvStepTerms(step, { previousId: 'previous', powerLabel, base: xTerm(x) }),
  };
}

function inverseStep(x: number, inverse: number): SboxStep {
  const zero = x === 0;
  return {
    op: 'inverse',
    region: 'inverse',
    value: inverse,
    highlights: [highlight('input', 'read'), highlight('inverse', 'write')],
    narration: i18nRef(`${NS}.step.${zero ? 'inverseZero' : 'inverse'}`, { x: braceHex(x), inverse: braceHex(inverse) }),
    formula: i18nRef(`${NS}.math.${zero ? 'inverseZero' : 'inverse'}`),
    terms: [xTerm(x), term('inverse', i18nRef(`${NS}.term.inverse`), inverse, 'result')],
  };
}

const bitSymbols = (positions: number[]): string => positions.map((position) => `b${position}`).join(' ⊕ ');

function affineBitStep(inverse: number, bitStep: AffineBitStep, partial: number): SboxStep {
  const { bit, inputBits, inputValues, constantBit, result } = bitStep;
  const [i0, i1, i2, i3, i4] = inputBits;
  return {
    op: 'affineBit',
    region: 'output',
    value: partial,
    highlights: [highlight('inverse', 'read'), highlight('constant', 'constant'), highlight('output', 'write')],
    narration: i18nRef(`${NS}.step.affineBit`, {
      bit,
      terms: bitSymbols(inputBits),
      values: inputValues.join(' ⊕ '),
      c: constantBit,
      result,
      partial: braceHex(partial),
    }),
    formula: i18nRef(`${NS}.math.affineBit`, { bit, i0: i0!, i1: i1!, i2: i2!, i3: i3!, i4: i4! }),
    terms: [
      term('inverse', i18nRef(`${NS}.term.inverse`), inverse, 'operand', { op: 'affine-bit', bits: inputBits }),
      term('constant', i18nRef(`${NS}.term.constant`), AFFINE_CONSTANT, 'constant', { op: 'xor', bits: [bit] }),
      term('bit', i18nRef(`${NS}.term.bit`, { bit }), result, 'result', { width: 1 }),
      term('output', i18nRef(`${NS}.term.output`), partial, 'intermediate', { bits: Array.from({ length: bit + 1 }, (_, i) => i) }),
    ],
  };
}

function resultStep(x: number, inverse: number, sbox: number): SboxStep {
  const params = { x: braceHex(x), s: braceHex(sbox), row: (x >> 4).toString(16), col: (x & 0xf).toString(16) };
  return {
    op: 'result',
    region: 'output',
    value: sbox,
    highlights: [highlight('input', 'read'), highlight('output', 'sbox')],
    narration: i18nRef(`${NS}.step.${x === 0 ? 'resultZero' : 'result'}`, params),
    formula: i18nRef(`${NS}.math.result`, { x: braceHex(x), s: braceHex(sbox) }),
    terms: [xTerm(x), term('inverse', i18nRef(`${NS}.term.inverse`), inverse, 'intermediate'), term('sbox', i18nRef(`${NS}.term.sbox`), sbox, 'result', { op: 'result' })],
  };
}

function recordInversion(recorder: SboxRecorder, x: number): number {
  const { steps, result } = ginvSteps(x);
  // x = 0 has no inverse: skip the (all-zero) powers and state the convention instead.
  if (x !== 0) steps.forEach((step) => emit(recorder, powerStep(x, step)));
  emit(recorder, inverseStep(x, result));
  return result;
}

function recordAffine(recorder: SboxRecorder, inverse: number): number {
  let partial = 0;
  for (const bitStep of affineSteps(inverse)) {
    partial |= bitStep.result << bitStep.bit;
    emit(recorder, affineBitStep(inverse, bitStep, partial));
  }
  return partial;
}

export interface SboxDerivation {
  state: SboxStateFacet;
  math: MathFacet;
  inverse: number;
  sbox: number;
  /** State step index at which the inverse is final. */
  inverseStep: number;
}

/** Records the full derivation of S(x) in scopes [phase, op]. */
export function recordSboxDerivation(x: number): SboxDerivation {
  const recorder = sboxRecorder(x);
  let inverse = 0;
  let sbox = 0;
  inPhase(recorder, PHASE.inversion, () => (inverse = recordInversion(recorder, x)));
  const inverseStep = recorder.stepCount - 1;
  inPhase(recorder, PHASE.affine, () => {
    sbox = recordAffine(recorder, inverse);
    emit(recorder, resultStep(x, inverse, sbox));
  });
  return { state: recorder.stateFacet(), math: recorder.mathFacet(), inverse, sbox, inverseStep };
}
