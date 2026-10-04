import type { TraceBundle } from '@cryventure/core';
import { describe, expect, it, vi } from 'vitest';
import { aesFixtureBundle } from './fixtures/aesBundles.ts';
import {
  memoizePerBundle,
  regionSlice,
  requiredFacet,
  requiredStateFacet,
  traceContractError,
} from './traceFacets.ts';

describe('traceFacets', () => {
  it('names the contract in its errors', () => {
    expect(traceContractError('AES', 'no output').message).toBe('AES trace contract: no output');
  });

  it('requires facets and state regions', () => {
    const bundle = aesFixtureBundle('fips197-c1');
    expect(requiredFacet<{ kind: string }>(bundle, 'values', 'AES').kind).toBe('values');
    expect(requiredStateFacet(bundle, ['state', 'w'], 'AES').kind).toBe('state');
    expect(() => requiredFacet(bundle, 'wordops', 'X')).toThrow(
      'X trace contract: no wordops facet',
    );
    expect(() => requiredStateFacet(bundle, ['vars'], 'X')).toThrow(
      'X trace contract: no "vars" region',
    );
  });

  it('slices a region of a snapshot, undefined when it is too short', () => {
    const snapshot = { w: [1, 2, 3, 4, 5] };
    expect(regionSlice(snapshot, 'w', 1, 3)).toEqual([2, 3, 4]);
    expect(regionSlice(snapshot, 'w', 4, 2)).toBeUndefined();
    expect(regionSlice(snapshot, 'h', 0, 1)).toBeUndefined();
  });

  it('memoises per bundle and does not cache a throw', () => {
    const read = vi.fn((bundle: TraceBundle) => {
      if (Object.keys(bundle.facets).length === 0) throw new Error('broken');
      return { bundle };
    });
    const memoised = memoizePerBundle(read);
    const bundle = aesFixtureBundle('fips197-c1');
    expect(memoised(bundle)).toBe(memoised(bundle));
    expect(read).toHaveBeenCalledTimes(1);
    const broken = { ...bundle, facets: {} };
    expect(() => memoised(broken)).toThrow('broken');
    expect(() => memoised(broken)).toThrow('broken');
    expect(read).toHaveBeenCalledTimes(3);
  });
});
