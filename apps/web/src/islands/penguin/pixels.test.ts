import { describe, expect, it } from 'vitest';
import { countRepeatedBlocks, fitWithin, rgbaToRgb, rgbToRgba } from './pixels.ts';

describe('rgbaToRgb', () => {
  it('drops every fourth (alpha) byte', () => {
    expect(Array.from(rgbaToRgb([1, 2, 3, 255, 4, 5, 6, 0]))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ignores a trailing partial pixel and handles empty input', () => {
    expect(Array.from(rgbaToRgb([1, 2, 3, 4, 9]))).toEqual([1, 2, 3]);
    expect(rgbaToRgb([])).toHaveLength(0);
  });
});

describe('rgbToRgba', () => {
  it('adds an opaque alpha channel', () => {
    expect(Array.from(rgbToRgba([1, 2, 3, 4, 5, 6], 2))).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it('ignores extra (padding) bytes and fills missing bytes with 0', () => {
    expect(Array.from(rgbToRgba([1, 2, 3, 4, 5, 6, 7], 1))).toEqual([1, 2, 3, 255]);
    expect(Array.from(rgbToRgba([1, 2, 3, 4], 2))).toEqual([1, 2, 3, 255, 4, 0, 0, 255]);
  });

  it('round-trips with rgbaToRgb for opaque pixels', () => {
    const rgba = [10, 20, 30, 255, 40, 50, 60, 255];
    expect(Array.from(rgbToRgba(rgbaToRgb(rgba), 2))).toEqual(rgba);
  });
});

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the aspect ratio', () => {
    expect(fitWithin({ width: 1024, height: 512 }, 256)).toEqual({ width: 256, height: 128 });
    expect(fitWithin({ width: 300, height: 1200 }, 256)).toEqual({ width: 64, height: 256 });
  });

  it('never upscales', () => {
    expect(fitWithin({ width: 100, height: 50 }, 256)).toEqual({ width: 100, height: 50 });
  });

  it('keeps every side at least one pixel', () => {
    expect(fitWithin({ width: 10_000, height: 1 }, 256)).toEqual({ width: 256, height: 1 });
  });
});

describe('countRepeatedBlocks', () => {
  it('counts blocks that equal an earlier block', () => {
    const a = new Uint8Array(4).fill(1);
    const b = new Uint8Array(4).fill(2);
    const bytes = new Uint8Array([...a, ...b, ...a, ...a, ...b]);
    expect(countRepeatedBlocks(bytes, 4)).toEqual({ repeated: 3, total: 5 });
  });

  it('ignores a trailing partial block', () => {
    expect(countRepeatedBlocks(new Uint8Array(10), 4)).toEqual({ repeated: 1, total: 2 });
  });
});
