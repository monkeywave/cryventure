import { describe, expect, it } from 'vitest';
import type { RegionSpec } from '@cryventure/core';
import { COLLAPSIBLE_ABOVE_ELEMENTS, isCollapsibleRegion, isMatrixRegion, isWordRegion, regionByteSize, regionHighlights, regionLayout } from './regionLayout.ts';

const region = (shape: number[], order?: RegionSpec<string>['order']): RegionSpec<string> => ({ id: 'r', labelKey: 'k', elem: 'u8', shape, order });

describe('regionLayout', () => {
  it('keeps small 2-D regions as matrices in their own order', () => {
    expect(isMatrixRegion(region([4, 4]))).toBe(true);
    expect(regionLayout(region([4, 4], 'col-major'))).toEqual({ kind: 'matrix', shape: [4, 4], order: 'col-major' });
  });

  it('renders [n,4] regions with more than four rows as word rows', () => {
    expect(isWordRegion(region([44, 4]))).toBe(true);
    expect(isWordRegion(region([4, 4]))).toBe(false);
    expect(isWordRegion(region([8, 8]))).toBe(false);
    expect(isMatrixRegion(region([8, 4]))).toBe(false);
    expect(regionLayout(region([60, 4], 'col-major'))).toEqual({ kind: 'words', shape: [60, 4], order: 'row-major' });
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
