import { describe, expect, it } from 'vitest';
import { readDigits } from './manifestKit.ts';

const RANGE = { min: 1, max: 255 } as const;

describe('readDigits', () => {
  it.each([
    ['1', '1'],
    ['255', '255'],
    ['007', '7'],
    ['0042', '42'],
    ['0000000000000000000000001', '1'],
  ])('accepts %j as %j: digits only, normalised without leading zeros', (input, expected) => {
    expect(readDigits(input, RANGE)).toBe(expected);
  });

  it.each(['0', '256', '', ' 42 ', '42 ', ' 42', '\t42', '+42', '-1', '4.2', '1e2', '0x10', '４２', 'abc', '9'.repeat(400), 42, null, undefined])('rejects %j', (input) => {
    expect(readDigits(input, RANGE)).toBeUndefined();
  });
});
