import { describe, expect, it } from 'vitest';
import { fitBytesPerRow, offsetLabel, placeSegments, WIRE_BOX_PITCH_EM, WIRE_GUTTER_EM, wireChangeStep } from './wireModel.ts';
import { wireCase } from './testFixture.ts';

describe('placeSegments', () => {
  it('places segments at their global offsets in rows of 16', () => {
    const placed = placeSegments(wireCase('ctr/short-message').facet, -1);
    expect(placed.map(({ start }) => start)).toEqual([0, 16, 32]);
    expect(placed.map(({ rows }) => rows.map((row) => row.length))).toEqual([[16], [16], [4]]);
    expect(placed.map(({ activeCount }) => activeCount)).toEqual([16, 0, 0]);
  });

  it('marks segments pending before their availableAt step', () => {
    const { facet } = wireCase('ctr/short-message');
    expect(placeSegments(facet, -1).map(({ pending }) => pending)).toEqual([false, true, true]);
    expect(placeSegments(facet, 1).map(({ pending }) => pending)).toEqual([false, false, true]);
    expect(placeSegments(facet, 4).map(({ pending }) => pending)).toEqual([false, false, false]);
  });

  it('splits long segments into several rows', () => {
    const { facet } = wireCase('ecb/repeated-blocks');
    const long = { ...facet, segments: [{ ...facet.segments[0]!, bytes: new Array<number>(40).fill(0) }], activeAt: [] };
    expect(placeSegments(long, 0)[0]?.rows.map((row) => row[0]?.offset)).toEqual([0, 16, 32]);
  });

  it('wraps rows at the given width (16, 8 or 4 bytes)', () => {
    const { facet } = wireCase('ctr/short-message');
    expect(placeSegments(facet, -1, 4).map(({ rows }) => rows.map((row) => row.length))).toEqual([[4, 4, 4, 4], [4, 4, 4, 4], [4]]);
    expect(placeSegments(facet, -1, 8)[0]?.rows.map((row) => row[0]?.offset)).toEqual([0, 8]);
  });

  it('reads the flip mask per byte', () => {
    const { facet } = wireCase('ecb/repeated-blocks');
    const placed = placeSegments({ ...facet, flip: { param: 'm', maskHex: '80' + '00'.repeat(47) } }, -1);
    expect(placed[0]?.rows[0]?.[0]?.flipMask).toBe(0x80);
    expect(placed.map(({ flippedCount }) => flippedCount)).toEqual([1, 0, 0]);
  });
});

describe('fitBytesPerRow', () => {
  it('fits 16, 8 or 4 boxes of at least their minimum width (em = 16px)', () => {
    expect(fitBytesPerRow(undefined, 16)).toBe(16);
    expect(fitBytesPerRow(900, 16)).toBe(16);
    expect(fitBytesPerRow(300, 16)).toBe(8);
    expect(fitBytesPerRow(200, 16)).toBe(4);
    expect(fitBytesPerRow(80, 16)).toBe(4);
  });

  it('never squeezes a row below the box minimum', () => {
    for (const width of [150, 250, 350, 450, 550]) {
      const perRow = fitBytesPerRow(width, 16);
      expect(perRow === 4 || width >= (WIRE_GUTTER_EM + perRow * WIRE_BOX_PITCH_EM) * 16).toBe(true);
    }
  });
});

describe('wireChangeStep', () => {
  it('maps a step to the last step at which highlights or availability changed', () => {
    const { facet, stepCount } = wireCase('cbc/repeated-blocks');
    const steps = Array.from({ length: stepCount + 1 }, (_, i) => i - 1);
    for (const step of steps) expect(placeSegments(facet, wireChangeStep(facet, step))).toEqual(placeSegments(facet, step));
    expect(new Set(steps.map((step) => wireChangeStep(facet, step))).size).toBeLessThan(steps.length);
  });
});

describe('offsetLabel', () => {
  it('pads to two hex digits, four past 256 bytes', () => {
    expect(offsetLabel(16, 64)).toBe('0x10');
    expect(offsetLabel(16, 512)).toBe('0x0010');
  });
});
