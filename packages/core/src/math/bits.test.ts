import { describe, expect, it } from 'vitest';
import { bitOf } from './bits.ts';

describe('bitOf', () => {
  it('reads one bit, 0 = LSB', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((position) => bitOf(0x53, position))).toEqual([1, 1, 0, 0, 1, 0, 1, 0]);
    expect(bitOf(0x15c, 8)).toBe(1);
  });
});
