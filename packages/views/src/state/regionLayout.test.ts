import { describe, expect, it } from 'vitest';
import type { RegionSpec } from '@cryventure/core';
import { COLLAPSIBLE_ABOVE_ELEMENTS, isCollapsibleRegion, isMatrixRegion, regionByteSize, regionDensity, regionHighlights, regionLayout } from './regionLayout.ts';

const region = (shape: number[], order?: RegionSpec<string>['order'], layout?: RegionSpec<string>['layout']): RegionSpec<string> => ({ id: 'r', labelKey: 'k', elem: 'u8', shape, order, layout });

describe('regionLayout', () => {
  it('keeps small 2-D regions as matrices in their own order', () => {
    expect(isMatrixRegion(region([4, 4]))).toBe(true);
    expect(regionLayout(region([4, 4], 'col-major'))).toEqual({ kind: 'matrix', shape: [4, 4], order: 'col-major' });
  });

  it("renders the producer's words hint as one row per word, grouped per line", () => {
    const words = { kind: 'words' as const, wordBytes: 4, labelPrefix: 'w', wordsPerGroup: 4 };
    expect(regionLayout(region([44, 4], 'col-major', words))).toEqual({
      kind: 'words',
      shape: [44, 4],
      order: 'row-major',
      words: { elemsPerWord: 4, wordsPerLine: 4, labelPrefix: 'w' },
    });
    expect(regionLayout(region([16], undefined, { kind: 'words', wordBytes: 8 }))).toEqual({
      kind: 'words',
      shape: [2, 8],
      order: 'row-major',
      words: { elemsPerWord: 8, wordsPerLine: 1, labelPrefix: '' },
    });
    const u32Words: RegionSpec<string> = { id: 'k', labelKey: 'k', elem: 'u32', shape: [8], layout: { kind: 'words', wordBytes: 4, labelPrefix: 'k' } };
    expect(regionLayout(u32Words).shape).toEqual([8, 1]);
  });

  it("carries a little-endian words hint's byte order (big/absent adds nothing)", () => {
    expect(regionLayout(region([4, 8], undefined, { kind: 'words', wordBytes: 8, byteOrder: 'little' })).words).toEqual({ elemsPerWord: 8, wordsPerLine: 1, labelPrefix: '', byteOrder: 'little' });
    expect(regionLayout(region([4, 8], undefined, { kind: 'words', wordBytes: 8, byteOrder: 'big' })).words).toEqual({ elemsPerWord: 8, wordsPerLine: 1, labelPrefix: '' });
  });

  it('never guesses words from the shape: without a hint [n,4] is a long byte region', () => {
    expect(isMatrixRegion(region([8, 4]))).toBe(true);
    expect(regionLayout(region([44, 4])).kind).toBe('rows');
    expect(regionLayout(region([4, 4], 'col-major', { kind: 'grid' }))).toEqual({ kind: 'matrix', shape: [4, 4], order: 'col-major' });
  });

  it('wraps other long regions into rows of 16 with offsets', () => {
    expect(isMatrixRegion(region([10, 8]))).toBe(false);
    const layout = regionLayout(region([10, 8], 'row-major'));
    expect(layout.kind).toBe('rows');
    expect(layout.shape).toEqual([5, 16]);
    expect(layout.rowOffsets?.slice(0, 3)).toEqual([0, 16, 32]);
  });

  it('handles short 1-D regions', () => {
    expect(regionLayout(region([12]))).toEqual({ kind: 'rows', shape: [1, 12], order: 'row-major', rowOffsets: [0] });
  });

  it('gives a single-element region no address gutter', () => {
    expect(regionLayout(region([1]))).toEqual({ kind: 'rows', shape: [1, 1], order: 'row-major' });
    expect(regionLayout(region([1], undefined, { kind: 'grid' })).rowOffsets).toBeUndefined();
  });

  it('draws one-byte words that fit on one line as one row with an address over each cell (+0 +1 +2 +3)', () => {
    const memory = { kind: 'words' as const, wordBytes: 1, labelPrefix: '+', wordsPerGroup: 4 };
    expect(regionLayout(region([4], undefined, memory))).toEqual({ kind: 'rows', shape: [1, 4], order: 'row-major', columnLabels: ['+0', '+1', '+2', '+3'] });
    expect(regionLayout(region([8], undefined, { ...memory, wordsPerGroup: 4 })).kind).toBe('words');
  });
});

describe('regionHighlights', () => {
  it('filters the step highlights by region', () => {
    const step = { highlights: [{ region: 'state', indices: [0], kind: 'xor' as const }, { region: 'w', indices: [1], kind: 'read' as const }] };
    expect(regionHighlights(step, 'w')).toEqual([{ region: 'w', indices: [1], kind: 'read' }]);
    expect(regionHighlights(undefined, 'w')).toEqual([]);
  });
});

describe('isCollapsibleRegion', () => {
  it('collapses only regions with more than 64 elements', () => {
    expect(isCollapsibleRegion(region([44, 4]))).toBe(true);
    expect(isCollapsibleRegion(region([16, 4]))).toBe(false);
    expect(COLLAPSIBLE_ABOVE_ELEMENTS).toBe(64);
    expect(isCollapsibleRegion(region([65]))).toBe(true);
    expect(isCollapsibleRegion(region([4, 4]))).toBe(false);
  });
});

describe('regionByteSize', () => {
  it('multiplies the element count by the element width', () => {
    expect(regionByteSize(region([44, 4]))).toBe(176);
    expect(regionByteSize({ shape: [60], elem: 'u32' })).toBe(240);
    expect(regionByteSize({ shape: [3], elem: 'u64' })).toBe(24);
  });
});

describe('regionDensity', () => {
  it('draws stacked grids wider than a matrix compact, matrices and word rows regular', () => {
    expect(regionDensity({ shape: [4, 16] })).toBe('compact');
    expect(regionDensity({ shape: [4, 4] })).toBe('regular');
    expect(regionDensity({ shape: [1, 8] })).toBe('regular');
    expect(regionDensity({ shape: [44, 16], words: { elemsPerWord: 16, wordsPerLine: 1, labelPrefix: 'w' } })).toBe('regular');
  });
});
