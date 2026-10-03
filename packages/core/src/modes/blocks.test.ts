import { describe, expect, it } from 'vitest';
import { blocksOf, concatBlocks } from './blocks.ts';

describe('blocksOf', () => {
  it('splits aligned data into copies of each block', () => {
    const data = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    const blocks = blocksOf(data, 2);
    expect(blocks.map((block) => [...block])).toEqual([[1, 2], [3, 4], [5, 6]]);
    blocks[0]![0] = 99;
    expect(data[0]).toBe(1);
  });
  it('returns no blocks for empty data', () => {
    expect(blocksOf(new Uint8Array(0), 16)).toEqual([]);
  });
  it('throws RangeError for unaligned data or a non-positive block size', () => {
    expect(() => blocksOf(new Uint8Array(5), 2)).toThrow(RangeError);
    expect(() => blocksOf(new Uint8Array(4), 0)).toThrow(RangeError);
  });
});

describe('concatBlocks', () => {
  it('joins blocks in order', () => {
    expect([...concatBlocks([Uint8Array.of(1, 2), Uint8Array.of(3)])]).toEqual([1, 2, 3]);
  });
  it('returns an empty array for no blocks', () => {
    expect(concatBlocks([]).length).toBe(0);
  });
});
