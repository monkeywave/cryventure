import { describe, expect, it } from 'vitest';
import { offsetLabel, placeSegments } from './wireModel.ts';
import { wireCase } from './testFixture.ts';

describe('placeSegments', () => {
  it('places segments at their global offsets in rows of 16', () => {
    const placed = placeSegments(wireCase('ctr/short-message').facet, -1);
    expect(placed.map(({ start }) => start)).toEqual([0, 16, 32]);
    expect(placed.map(({ rows }) => rows.map((row) => row.length))).toEqual([[16], [16], [4]]);
    expect(placed.map(({ activeCount }) => activeCount)).toEqual([16, 0, 0]);
  });

  it('splits long segments into several rows', () => {
    const { facet } = wireCase('ecb/repeated-blocks');
    const long = { ...facet, segments: [{ ...facet.segments[0]!, bytes: new Array<number>(40).fill(0) }], activeAt: [] };
    expect(placeSegments(long, 0)[0]?.rows.map((row) => row[0]?.offset)).toEqual([0, 16, 32]);
  });

  it('reads the flip mask per byte', () => {
    const { facet } = wireCase('ecb/repeated-blocks');
    const placed = placeSegments({ ...facet, flip: { param: 'm', maskHex: '80' + '00'.repeat(47) } }, -1);
    expect(placed[0]?.rows[0]?.[0]?.flipMask).toBe(0x80);
    expect(placed.map(({ flippedCount }) => flippedCount)).toEqual([1, 0, 0]);
  });
});

describe('offsetLabel', () => {
  it('pads to two hex digits, four past 256 bytes', () => {
    expect(offsetLabel(16, 64)).toBe('0x10');
    expect(offsetLabel(16, 512)).toBe('0x0010');
  });
});
