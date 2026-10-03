import { describe, expect, it } from 'vitest';
import type { RegionSpec } from '../facets/state.ts';
import { singleCellRegion, zeroSnapshot } from './regions.ts';

describe('singleCellRegion', () => {
  it('is a blank one-byte grid by default', () => {
    expect(singleCellRegion('plugin.x', 'acc')).toEqual({ id: 'acc', labelKey: 'plugin.x.region.acc', elem: 'u8', shape: [1], layout: { kind: 'grid' }, initial: 'blank' });
  });

  it('takes element type, order and a meaningful initial value', () => {
    const region = singleCellRegion('plugin.x', 'c', { elem: 'u16', order: 'row-major', blank: false });
    expect(region).toEqual({ id: 'c', labelKey: 'plugin.x.region.c', elem: 'u16', shape: [1], order: 'row-major', layout: { kind: 'grid' } });
    expect('initial' in region).toBe(false);
  });
});

describe('zeroSnapshot', () => {
  it('zeroes every element of every region', () => {
    const regions: RegionSpec<'a' | 'grid'>[] = [
      { id: 'a', labelKey: 'k', elem: 'u8', shape: [3] },
      { id: 'grid', labelKey: 'k', elem: 'u8', shape: [2, 4] },
    ];
    expect(zeroSnapshot(regions)).toEqual({ a: [0, 0, 0], grid: new Array(8).fill(0) });
  });
});
