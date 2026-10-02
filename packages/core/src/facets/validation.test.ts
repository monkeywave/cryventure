import { describe, expect, it } from 'vitest';
import { isIndex } from './validation.ts';

describe('isIndex', () => {
  it('accepts integers in 0..length-1 only', () => {
    expect([0, 3].map((value) => isIndex(value, 4))).toEqual([true, true]);
    expect([-1, 4, 1.5, Number.NaN].map((value) => isIndex(value, 4))).toEqual([false, false, false, false]);
  });
});
