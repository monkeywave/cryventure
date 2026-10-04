import type { I18nRef } from '../i18n.ts';
import { latestStepAt } from '../latestStepAt.ts';
import { INITIAL_STEP_INDEX, isIndex, isStepIndex, kindProblems } from './validation.ts';

/**
 * Math facet: per-step equations (GF(2^8) multiplication, inversion, the affine map …) as plain
 * terms that views typeset. Each `MathStep.step` is a state-facet step index (see docs/M2.md §2), or −1
 * for the initial state (e.g. the loaded operands, see docs/M3.md §0a).
 */

/** How a term enters the computation. */
export type MathOp = 'xor' | 'shift' | 'reduce' | 'mul' | 'square' | 'affine-bit' | 'result';

export type MathTermRole = 'operand' | 'intermediate' | 'constant' | 'carry' | 'result';

export interface MathTerm {
  /** Stable within the facet, e.g. 'acc', 'carry', 'p3'. */
  id: string;
  /** `plugin.<id>.*` key. */
  label: I18nRef;
  /** Unsigned, < 2 ** width. */
  value: number;
  /** 1..32 bits (8 = GF(2^8) element, 9 = unreduced product). */
  width: number;
  role: MathTermRole;
  op?: MathOp;
  /** Emphasised bit positions, 0 = LSB. */
  bits?: number[];
  /**
   * Position of the bit a shift carried out of the byte (e.g. 8 of an unreduced `a << 1`), which
   * views mark as the carry. Set by the producer; never inferred from `width` (the modulus {11b}
   * has a bit 8 that nothing carried out). A term with role `carry` is a carry bit as a whole.
   */
  carryBit?: number;
}

export interface MathStep {
  /** State-facet step index, or −1 for the initial state. */
  step: number;
  formula: I18nRef;
  terms: MathTerm[];
}

export interface MathFacet {
  kind: 'math';
  schemaVersion: 1;
  notation: { field: 'gf2^8'; modulus: number };
  /** Strictly increasing `step` (the first may be −1, the initial state). */
  steps: MathStep[];
}

export const MAX_MATH_TERM_WIDTH = 32;

/** The latest math step whose `step ≤ step`, or `undefined` before the first: `latestStepAt` over `facet.steps`. */
export function mathStepAt(facet: MathFacet, step: number): MathStep | undefined {
  return latestStepAt(facet.steps, step);
}

/** Problems of one term (`where` prefixes each message). */
export function mathTermProblems(term: MathTerm, where: string): string[] {
  const { width, value, bits = [], carryBit } = term;
  if (!Number.isInteger(width) || width < 1 || width > MAX_MATH_TERM_WIDTH) return [`${where}: width ${width} not in 1..${MAX_MATH_TERM_WIDTH}`];
  const problems: string[] = [];
  if (!isIndex(value, 2 ** width)) problems.push(`${where}: value ${value} is not an unsigned ${width}-bit integer`);
  for (const bit of bits) if (!isIndex(bit, width)) problems.push(`${where}: bit ${bit} outside 0..${width - 1}`);
  if (carryBit !== undefined && !isIndex(carryBit, width)) problems.push(`${where}: carry bit ${carryBit} outside 0..${width - 1}`);
  return problems;
}

function mathStepProblems(step: MathStep, previous: number | undefined): string[] {
  const problems: string[] = [];
  if (!isStepIndex(step.step)) problems.push(`math: step ${step.step} is not an integer ≥ ${INITIAL_STEP_INDEX}`);
  if (previous !== undefined && step.step <= previous) problems.push(`math: step ${step.step} does not increase (after ${previous})`);
  const ids = new Set<string>();
  for (const term of step.terms) {
    const where = `math step ${step.step} term "${term.id}"`;
    if (ids.has(term.id)) problems.push(`${where}: duplicate id`);
    ids.add(term.id);
    problems.push(...mathTermProblems(term, where));
  }
  return problems;
}

/** Schema problems of a math facet (empty = valid): increasing steps, unique term ids, values fit widths. */
export function validateMathFacet(facet: MathFacet): string[] {
  const wrongKind = kindProblems(facet, 'math');
  if (wrongKind.length > 0) return wrongKind;
  const modulusOk = Number.isInteger(facet.notation.modulus) && facet.notation.modulus > 0;
  const problems = modulusOk ? [] : [`math: modulus ${facet.notation.modulus} is not a positive integer`];
  facet.steps.forEach((step, index) => problems.push(...mathStepProblems(step, facet.steps[index - 1]?.step)));
  return problems;
}

/** Throws the first `validateMathFacet` problem. */
export function assertValidMathFacet(facet: MathFacet): void {
  const [problem] = validateMathFacet(facet);
  if (problem !== undefined) throw new Error(problem);
}
