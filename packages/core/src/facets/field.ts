import type { I18nRef } from '../i18n.ts';
import type { MathOp, MathTermRole } from './math.ts';
import { latestStepAt } from '../latestStepAt.ts';
import { INITIAL_STEP_INDEX, isIndex, isStepIndex, kindProblems } from './validation.ts';

/**
 * Field facet: per-step GF(2^128) equations for GHASH (docs/M4.md §3e). The math facet's terms
 * stay ≤ 32 bits; 128-bit field elements get this facet, with the same step model as `MathFacet`.
 */

/** Byte length of a GF(2^128) element. */
export const FIELD_ELEMENT_BYTES = 16;

export interface FieldTerm {
  id: string;
  label: I18nRef;
  /** 16 bytes. */
  bytes: number[];
  role: MathTermRole;
  op?: MathOp | 'select';
  /** Emphasised bits in GCM order: 0 = MSB of byte 0 = coefficient of x⁰. */
  bits?: number[];
  valueRef?: string;
}

export interface FieldStep {
  /** State-facet step index, or −1 for the initial state. */
  step: number;
  formula: I18nRef;
  terms: FieldTerm[];
}

export interface FieldFacet {
  kind: 'field';
  schemaVersion: 1;
  notation: { field: 'gf2^128'; modulus: 'x^128+x^7+x^2+x+1'; bitOrder: 'gcm-reflected' };
  /** Strictly increasing `step` (the first may be −1, the initial state). */
  steps: FieldStep[];
}

/** The latest field step whose `step ≤ step`, or `undefined` before the first: `latestStepAt` over `facet.steps`. */
export function fieldStepAt(facet: FieldFacet, step: number): FieldStep | undefined {
  return latestStepAt(facet.steps, step);
}

function fieldTermProblems(term: FieldTerm, where: string): string[] {
  const bitCount = FIELD_ELEMENT_BYTES * 8;
  const problems = term.bytes.length === FIELD_ELEMENT_BYTES ? [] : [`${where}: ${term.bytes.length} bytes, expected ${FIELD_ELEMENT_BYTES}`];
  for (const byte of term.bytes) if (!isIndex(byte, 256)) problems.push(`${where}: ${byte} is not a byte`);
  for (const bit of term.bits ?? []) if (!isIndex(bit, bitCount)) problems.push(`${where}: bit ${bit} outside 0..${bitCount - 1}`);
  return problems;
}

function fieldStepProblems(step: FieldStep, previous: number | undefined): string[] {
  const problems: string[] = [];
  if (!isStepIndex(step.step)) problems.push(`field: step ${step.step} is not an integer ≥ ${INITIAL_STEP_INDEX}`);
  if (previous !== undefined && step.step <= previous) problems.push(`field: step ${step.step} does not increase (after ${previous})`);
  const ids = new Set<string>();
  for (const term of step.terms) {
    const where = `field step ${step.step} term "${term.id}"`;
    if (ids.has(term.id)) problems.push(`${where}: duplicate id`);
    ids.add(term.id);
    problems.push(...fieldTermProblems(term, where));
  }
  return problems;
}

/** Schema problems of a field facet (empty = valid): increasing steps, unique term ids, 16-byte terms, bits in 0..127. */
export function validateFieldFacet(facet: FieldFacet): string[] {
  const wrongKind = kindProblems(facet, 'field');
  if (wrongKind.length > 0) return wrongKind;
  return facet.steps.flatMap((step, index) => fieldStepProblems(step, facet.steps[index - 1]?.step));
}
