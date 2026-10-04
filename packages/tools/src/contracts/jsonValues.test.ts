import { describe, expect, it } from 'vitest';
import { isRecord, jsonValueProblems } from './jsonValues.ts';

describe('jsonValueProblems', () => {
  it('accepts plain JSON values and undefined object properties', () => {
    expect(jsonValueProblems({ a: [1, 'x', null, true, { b: undefined }], c: Object.create(null) as object })).toEqual([]);
  });

  it('flags values a JSON round trip changes, with their path', () => {
    const value = { n: Number.NaN, list: [undefined], bytes: new Uint8Array(1), big: 1n, fn: () => 0, map: new Map() };
    expect(jsonValueProblems(value)).toEqual([
      '$.n: NaN is not a finite number',
      '$.list[0]: undefined',
      '$.bytes: Uint8Array is not a plain object',
      '$.big: bigint is not JSON',
      '$.fn: function is not JSON',
      '$.map: Map is not a plain object',
    ]);
  });
});

describe('isRecord', () => {
  it('accepts objects and rejects null, arrays and primitives', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect([null, [], 'x', 1, undefined].map(isRecord)).toEqual([false, false, false, false, false]);
  });
});
