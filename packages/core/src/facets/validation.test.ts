import { describe, expect, it } from 'vitest';
import { describeValue, i18nRefProblems, INITIAL_STEP_INDEX, isIndex, isLowerHex, isPlainRecord, isStepIndex, isWellFormedI18nRef, kindProblems, stepCountProblems } from './validation.ts';

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

describe('isPlainRecord', () => {
  it('accepts objects only, not null or arrays', () => {
    expect([{}, { a: 1 }].map(isPlainRecord)).toEqual([true, true]);
    expect([null, [], 'x', 1, undefined].map(isPlainRecord)).toEqual([false, false, false, false, false]);
  });
});

describe('isWellFormedI18nRef / i18nRefProblems', () => {
  it('accepts a non-empty key with optional string/number params', () => {
    expect([{ key: 'k' }, { key: 'k', params: { n: 1, s: 'x' } }].map(isWellFormedI18nRef)).toEqual([true, true]);
  });

  it('rejects empty keys, non-objects and bad params', () => {
    expect([{ key: '' }, 'k', null, { key: 'k', params: [] }, { key: 'k', params: { b: true } }].map(isWellFormedI18nRef)).toEqual([false, false, false, false, false]);
  });

  it('names the place of a malformed ref', () => {
    expect(i18nRefProblems({ key: 'k' }, 'x')).toEqual([]);
    expect(i18nRefProblems(null, 'x label')).toEqual(['x label: not a well-formed I18nRef']);
  });
});

describe('isLowerHex', () => {
  it('accepts exactly `digits` lowercase hex digits', () => {
    expect(isLowerHex('00ff', 4)).toBe(true);
    expect(['00FF', '0ff', '00fg', 255, null].map((hex) => isLowerHex(hex, 4))).toEqual([false, false, false, false, false]);
  });
});

describe('describeValue', () => {
  it('prints primitives as is and anything else by type, without throwing', () => {
    expect(['x', 1, true, 2n, null, undefined].map(describeValue)).toEqual(['x', '1', 'true', '2', 'null', 'undefined']);
    expect([[], {}, Symbol('s'), () => 1].map(describeValue)).toEqual(['<array>', '<object>', '<symbol>', '<function>']);
    const hostile = { toString: () => { throw new Error('no'); } };
    expect(describeValue(hostile)).toBe('<object>');
  });
});

describe('validator gaps (M6 reviews)', () => {
  it('rejects NaN and ±Infinity I18nRef params', () => {
    expect([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((n) => isWellFormedI18nRef({ key: 'k', params: { n } }))).toEqual([false, false, false]);
  });

  it('kindProblems names a wrong or missing kind', () => {
    expect(kindProblems({ kind: 'math' }, 'math')).toEqual([]);
    expect(kindProblems({ kind: 'field' }, 'math')).toEqual(['math: kind field is not "math"']);
    expect(kindProblems({}, 'math')).toEqual(['math: kind undefined is not "math"']);
  });

  it('stepCountProblems rejects NaN, ±Infinity, negative and fractional step counts', () => {
    expect(stepCountProblems(undefined, 'x')).toEqual([]);
    expect(stepCountProblems(0, 'x')).toEqual([]);
    expect([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1.5].flatMap((n) => stepCountProblems(n, 'x'))).toEqual([
      'x: stepCount NaN is not a non-negative integer',
      'x: stepCount Infinity is not a non-negative integer',
      'x: stepCount -Infinity is not a non-negative integer',
      'x: stepCount -1 is not a non-negative integer',
      'x: stepCount 1.5 is not a non-negative integer',
    ]);
  });
});
