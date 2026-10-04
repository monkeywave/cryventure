import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { latestStepAt } from '../latestStepAt.ts';
import { assertValidMathFacet, mathStepAt, mathTermProblems, validateMathFacet, type MathFacet, type MathStep, type MathTerm } from './math.ts';

const term = (id: string, value: number, width = 8, extra: Partial<MathTerm> = {}): MathTerm => ({ id, label: i18nRef(`l.${id}`), value, width, role: 'operand', ...extra });
const mathStep = (step: number, terms: MathTerm[] = [term('a', 0x57)]): MathStep => ({ step, formula: i18nRef('f'), terms });
const facet = (steps: MathStep[], modulus = 0x11b): MathFacet => ({ kind: 'math', schemaVersion: 1, notation: { field: 'gf2^8', modulus }, steps });

describe('mathStepAt', () => {
  const sparse = facet([mathStep(2), mathStep(5), mathStep(9)]);
  it('returns undefined before the first step', () => expect(mathStepAt(sparse, 1)).toBeUndefined());
  it('returns the exact step', () => expect(mathStepAt(sparse, 5)?.step).toBe(5));
  it('returns the latest step at or before', () => {
    expect(mathStepAt(sparse, 8)?.step).toBe(5);
    expect(mathStepAt(sparse, 100)?.step).toBe(9);
  });
  it('handles an empty facet', () => expect(mathStepAt(facet([]), 0)).toBeUndefined());
  it('returns a step −1 entry at the initial state and until the next entry', () => {
    const withInitial = facet([mathStep(-1), mathStep(2)]);
    expect(mathStepAt(withInitial, -1)?.step).toBe(-1);
    expect(mathStepAt(withInitial, 1)?.step).toBe(-1);
    expect(mathStepAt(withInitial, 2)?.step).toBe(2);
  });
});

describe('mathTermProblems', () => {
  it('accepts values that fit the width and in-range bits', () => {
    expect(mathTermProblems(term('p', 0x1ff, 9, { bits: [0, 8], carryBit: 8 }), 't')).toEqual([]);
    expect(mathTermProblems(term('w', 0xffffffff, 32), 't')).toEqual([]);
  });
  it('rejects bad widths, oversized or negative values and out-of-range bits', () => {
    expect(mathTermProblems(term('a', 0, 0), 't')).toEqual(['t: width 0 not in 1..32']);
    expect(mathTermProblems(term('a', 0, 33), 't')).toEqual(['t: width 33 not in 1..32']);
    expect(mathTermProblems(term('a', 0x100), 't')).toEqual(['t: value 256 is not an unsigned 8-bit integer']);
    expect(mathTermProblems(term('a', -1), 't')).toEqual(['t: value -1 is not an unsigned 8-bit integer']);
    expect(mathTermProblems(term('c', 1, 1, { bits: [1] }), 't')).toEqual(['t: bit 1 outside 0..0']);
    expect(mathTermProblems(term('s', 0xae, 8, { carryBit: 8 }), 't')).toEqual(['t: carry bit 8 outside 0..7']);
  });
});

describe('validateMathFacet / assertValidMathFacet', () => {
  it('accepts a well-formed facet', () => {
    const valid = facet([mathStep(0), mathStep(3, [term('a', 1), term('b', 2)])]);
    expect(validateMathFacet(valid)).toEqual([]);
    expect(() => assertValidMathFacet(valid)).not.toThrow();
  });
  it('requires strictly increasing integer steps ≥ −1', () => {
    expect(validateMathFacet(facet([mathStep(2), mathStep(2)]))).toEqual(['math: step 2 does not increase (after 2)']);
    expect(validateMathFacet(facet([mathStep(-1), mathStep(0)]))).toEqual([]);
    expect(validateMathFacet(facet([mathStep(-2)]))).toEqual(['math: step -2 is not an integer ≥ -1']);
    expect(validateMathFacet(facet([mathStep(0.5)]))).toEqual(['math: step 0.5 is not an integer ≥ -1']);
  });
  it('rejects duplicate term ids, bad terms and a bad modulus', () => {
    const bad = facet([mathStep(0, [term('a', 1), term('a', 0x100)])], 0);
    expect(validateMathFacet(bad)).toEqual([
      'math: modulus 0 is not a positive integer',
      'math step 0 term "a": duplicate id',
      'math step 0 term "a": value 256 is not an unsigned 8-bit integer',
    ]);
    expect(() => assertValidMathFacet(bad)).toThrow('math: modulus 0 is not a positive integer');
  });
});

describe('validateMathFacet: kind (M6 review gap)', () => {
  it('rejects a facet of another kind', () => {
    const wrong = { ...facet([mathStep(0)]), kind: 'field' } as unknown as Parameters<typeof validateMathFacet>[0];
    expect(validateMathFacet(wrong)).toEqual(['math: kind field is not "math"']);
  });
});

describe('mathStepAt is latestStepAt over the steps', () => {
  it('agrees with latestStepAt for every playhead', () => {
    const sparse = facet([mathStep(-1), mathStep(2), mathStep(5)]);
    for (let playhead = -3; playhead <= 7; playhead++) expect(mathStepAt(sparse, playhead)).toBe(latestStepAt(sparse.steps, playhead));
  });
});
