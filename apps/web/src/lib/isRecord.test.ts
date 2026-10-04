import { describe, expect, it } from 'vitest';
import { isRecord } from './isRecord.ts';

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    for (const value of [null, undefined, [], 'x', 1, true]) expect(isRecord(value)).toBe(false);
  });
});
