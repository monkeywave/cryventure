import { describe, expect, it } from 'vitest';
import { applyWrites, elemBits, elemBytes, elemMax, regionSize, type ElemType, type Snapshot } from './state.ts';

type R = 'state' | 'key';
const base: Snapshot<R> = { state: [0, 0, 0, 0], key: [9, 9] };

describe('regionSize', () => {
  it('multiplies the shape', () => {
    expect(regionSize({ shape: [4, 4] })).toBe(16);
    expect(regionSize({ shape: [] })).toBe(1);
  });
});

describe('applyWrites', () => {
  it('writes values at an offset', () => {
    const next = applyWrites(base, [{ region: 'state', offset: 1, values: [7, 8] }]);
    expect(next.state).toEqual([0, 7, 8, 0]);
  });
  it('is copy-on-write: untouched regions keep their reference, input is not mutated', () => {
    const next = applyWrites(base, [{ region: 'state', offset: 0, values: [1] }]);
    expect(next.key).toBe(base.key);
    expect(next.state).not.toBe(base.state);
    expect(base.state).toEqual([0, 0, 0, 0]);
  });
  it('applies multiple writes to one region in order', () => {
    const next = applyWrites(base, [
      { region: 'state', offset: 0, values: [1, 2] },
      { region: 'state', offset: 1, values: [5] },
    ]);
    expect(next.state).toEqual([1, 5, 0, 0]);
  });
  it('returns the same snapshot when there are no writes', () => {
    expect(applyWrites(base, [])).toBe(base);
  });
  it('throws on unknown regions and out-of-bounds writes', () => {
    expect(() => applyWrites(base, [{ region: 'nope' as R, offset: 0, values: [1] }])).toThrow(/unknown region/);
    expect(() => applyWrites(base, [{ region: 'key', offset: 1, values: [1, 2] }])).toThrow(/exceeds/);
    expect(() => applyWrites(base, [{ region: 'key', offset: -1, values: [1] }])).toThrow(/exceeds/);
  });
});

describe('element helpers', () => {
  it('reports bytes, bits and max values per element type', () => {
    expect(['u8', 'u16', 'i16', 'u32', 'u64'].map((elem) => elemBytes(elem as ElemType))).toEqual([1, 2, 2, 4, 8]);
    expect(elemBits('u32')).toBe(32);
    expect(elemMax('u8')).toBe(0xff);
    expect(elemMax('i16')).toBe(0x7fff);
    expect(elemMax('u64')).toBe(Number.MAX_SAFE_INTEGER);
  });
});
