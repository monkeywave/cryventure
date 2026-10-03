import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { FIELD_ELEMENT_BYTES, fieldStepAt, validateFieldFacet, type FieldFacet, type FieldStep, type FieldTerm } from './field.ts';

const element = (fill = 0): number[] => Array.from({ length: FIELD_ELEMENT_BYTES }, () => fill);
const term = (id: string, extra: Partial<FieldTerm> = {}): FieldTerm => ({ id, label: i18nRef(`l.${id}`), bytes: element(), role: 'operand', ...extra });
const fieldStep = (step: number, terms: FieldTerm[] = [term('x')]): FieldStep => ({ step, formula: i18nRef('f'), terms });
const facet = (steps: FieldStep[]): FieldFacet => ({
  kind: 'field',
  schemaVersion: 1,
  notation: { field: 'gf2^128', modulus: 'x^128+x^7+x^2+x+1', bitOrder: 'gcm-reflected' },
  steps,
});

describe('fieldStepAt', () => {
  const sparse = facet([fieldStep(2), fieldStep(5), fieldStep(9)]);
  it('returns undefined before the first step and for an empty facet', () => {
    expect(fieldStepAt(sparse, 1)).toBeUndefined();
    expect(fieldStepAt(facet([]), 0)).toBeUndefined();
  });
  it('returns the exact or latest earlier step', () => {
    expect(fieldStepAt(sparse, 5)?.step).toBe(5);
    expect(fieldStepAt(sparse, 8)?.step).toBe(5);
    expect(fieldStepAt(sparse, 100)?.step).toBe(9);
  });
  it('returns a step −1 entry at the initial state', () => {
    expect(fieldStepAt(facet([fieldStep(-1), fieldStep(2)]), 1)?.step).toBe(-1);
  });
});

describe('validateFieldFacet', () => {
  it('accepts a well-formed facet', () => {
    const valid = facet([fieldStep(-1), fieldStep(3, [term('x', { bits: [0, 127], op: 'select' }), term('y', { role: 'result', op: 'xor', bytes: element(0xff) })])]);
    expect(validateFieldFacet(valid)).toEqual([]);
  });
  it('requires strictly increasing integer steps ≥ −1', () => {
    expect(validateFieldFacet(facet([fieldStep(2), fieldStep(2)]))).toEqual(['field: step 2 does not increase (after 2)']);
    expect(validateFieldFacet(facet([fieldStep(-2)]))).toEqual(['field: step -2 is not an integer ≥ -1']);
    expect(validateFieldFacet(facet([fieldStep(0.5)]))).toEqual(['field: step 0.5 is not an integer ≥ -1']);
  });
  it('rejects duplicate ids, wrong lengths, non-bytes and out-of-range bits', () => {
    const bad = facet([fieldStep(0, [term('a'), term('a', { bytes: [...element().slice(1), 300] }), term('b', { bytes: element().slice(1), bits: [128, -1] })])]);
    expect(validateFieldFacet(bad)).toEqual([
      'field step 0 term "a": duplicate id',
      'field step 0 term "a": 300 is not a byte',
      'field step 0 term "b": 15 bytes, expected 16',
      'field step 0 term "b": bit 128 outside 0..127',
      'field step 0 term "b": bit -1 outside 0..127',
    ]);
  });
});
