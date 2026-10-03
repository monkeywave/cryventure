import { describe, expect, it } from 'vitest';
import { INITIAL_STEP_INDEX, isIndex, isStepIndex } from './validation.ts';

describe('isIndex', () => {
  it('accepts integers in 0..length-1 only', () => {
    expect([0, 3].map((value) => isIndex(value, 4))).toEqual([true, true]);
    expect([-1, 4, 1.5, Number.NaN].map((value) => isIndex(value, 4))).toEqual([false, false, false, false]);
  });
});

describe('isStepIndex', () => {
  it('accepts integers ≥ −1 (−1 = the initial state)', () => {
    expect([INITIAL_STEP_INDEX, 0, 7].map(isStepIndex)).toEqual([true, true, true]);
    expect([-2, 0.5, Number.NaN, Number.POSITIVE_INFINITY].map(isStepIndex)).toEqual([false, false, false, false]);
  });
});
