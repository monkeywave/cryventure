import {
  affineSteps,
  AFFINE_CONSTANT,
  braceHex,
  ginvSteps,
  highlight,
  i18nRef,
  mathTerm,
  PairedRecorder,
  toHex,
  type AffineBitStep,
  type GinvStep,
  type Highlight,
  type I18nRef,
  type MathFacet,
  type MathTerm,
  type MathTermOptions,
  type RegionSpec,
  type ScopeLevel,
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

/** Phases (outermost scope level): load, inversion, affine map. */
export const PHASE = { load: 0, inversion: 1, affine: 2 } as const;

export const SBOX_SCOPE_LEVELS: ScopeLevel[] = ['phase', 'op'].map((level) => ({
  labelKey: `${NS}.scope.${level}`,
  nextKey: `${NS}.scope.${level}Next`,
  prevKey: `${NS}.scope.${level}Prev`,
}));

/** The affine constant is known up front; every other byte is a placeholder until a step computes it. */
function byteRegion(id: SboxRegion): RegionSpec<SboxRegion> {
  const spec: RegionSpec<SboxRegion> = { id, labelKey: `${NS}.region.${id}`, elem: 'u8', shape: [1], order: 'row-major', layout: { kind: 'grid' } };
  return id === 'constant' ? spec : { ...spec, initial: 'blank' };
}

export const SBOX_REGIONS: RegionSpec<SboxRegion>[] = (['input', 'inverse', 'constant', 'output'] as const).map(byteRegion);

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

/** Wraps core's `PairedRecorder`: each `emit` is one op-level state step (own scope) plus its math step. */
class SboxRecorder {
  readonly paired = new PairedRecorder<SboxRegion, SboxOp>(SBOX_REGIONS, { input: [0], inverse: [0], constant: [AFFINE_CONSTANT], output: [0] }, SBOX_SCOPE_LEVELS);

  emit({ op, region, value, highlights, narration, formula, terms }: SboxStep): void {
    this.paired.scopedStep({ op, writes: [{ region, offset: 0, values: [value] }], highlights, narration }, { formula, terms });
  }

  phase(index: number, body: () => void): void {
    this.paired.enter(index);
    body();
    this.paired.leave();
  }
}

function loadStep(x: number): SboxStep {
  const narrationKey = x === 0 ? 'loadZero' : 'load';
  return {
    op: 'load',
    region: 'input',
    value: x,
    highlights: [highlight('input', 'write')],
    narration: i18nRef(`${NS}.step.${narrationKey}`, { x: braceHex(x) }),
    formula: i18nRef(`${NS}.math.load`, { x: braceHex(x) }),
    terms: [xTerm(x)],
  };
}

function powerStep(x: number, step: GinvStep): SboxStep {
  const isSquare = step.op === 'square';
  const previousExp = isSquare ? step.exponent / 2 : step.exponent - 1;
  const previous = term('previous', powerLabel(previousExp), step.left, 'operand', isSquare ? { op: 'square' } : {});
  const factors = isSquare ? [previous] : [previous, xTerm(x, { op: 'mul' })];
  const params = { exp: step.exponent, previous: previousExp };
  return {
    op: isSquare ? 'square' : 'multiply',
    region: 'inverse',
    value: step.value,
    highlights: isSquare ? [highlight('inverse', 'write')] : [highlight('input', 'read'), highlight('inverse', 'write')],
    narration: i18nRef(`${NS}.step.${step.op}`, { exp: step.exponent, value: braceHex(step.value) }),
    formula: i18nRef(`${NS}.math.${step.op}`, params),
    terms: [...factors, term('power', powerLabel(step.exponent), step.value, 'intermediate')],
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
  const params = { x: braceHex(x), s: braceHex(sbox), row: toHex([x >> 4]).slice(1), col: toHex([x & 0xf]).slice(1) };
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
  if (x !== 0) steps.forEach((step) => recorder.emit(powerStep(x, step)));
  recorder.emit(inverseStep(x, result));
  return result;
}

function recordAffine(recorder: SboxRecorder, inverse: number): number {
  let partial = 0;
  for (const bitStep of affineSteps(inverse)) {
    partial |= bitStep.result << bitStep.bit;
    recorder.emit(affineBitStep(inverse, bitStep, partial));
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
  const recorder = new SboxRecorder();
  let inverse = 0;
  let sbox = 0;
  recorder.phase(PHASE.load, () => recorder.emit(loadStep(x)));
  recorder.phase(PHASE.inversion, () => (inverse = recordInversion(recorder, x)));
  const inverseStep = recorder.paired.stepCount - 1;
  recorder.phase(PHASE.affine, () => {
    sbox = recordAffine(recorder, inverse);
    recorder.emit(resultStep(x, inverse, sbox));
  });
  return { state: recorder.paired.stateFacet(), math: recorder.paired.mathFacet(), inverse, sbox, inverseStep };
}
