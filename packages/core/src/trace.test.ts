import { describe, expect, it } from 'vitest';
import { availableFacetKinds, facetKey, getFacet, parseFacetKey, type TraceBundle } from './trace.ts';

const bundle = (facets: TraceBundle['facets']): TraceBundle => ({
  schemaVersion: 1,
  producer: { kind: 'primitive', id: 'demo', apiVersion: 1 },
  provenance: 'modeled',
  params: {},
  facets,
  output: {},
});

describe('facetKey', () => {
  it('defaults the variant', () => {
    expect(facetKey('state')).toBe('state@default');
    expect(facetKey('memory', 'x86_64-linux-gnu')).toBe('memory@x86_64-linux-gnu');
  });
  it('accepts unknown (future) kinds', () => {
    expect(facetKey('quantum-circuit')).toBe('quantum-circuit@default');
  });
  it('rejects malformed parts', () => {
    expect(() => facetKey('')).toThrow(RangeError);
    expect(() => facetKey('a@b')).toThrow(RangeError);
    expect(() => facetKey('state', '')).toThrow(RangeError);
  });
});

describe('parseFacetKey', () => {
  it('splits at the first @', () => {
    expect(parseFacetKey('memory@recorded')).toEqual({ kind: 'memory', variant: 'recorded' });
    expect(parseFacetKey('memory@a@b')).toEqual({ kind: 'memory', variant: 'a@b' });
  });
  it('round-trips facetKey', () => {
    expect(parseFacetKey(facetKey('values', 'v2'))).toEqual({ kind: 'values', variant: 'v2' });
  });
  it('returns undefined for malformed keys', () => {
    expect(parseFacetKey('state')).toBeUndefined();
    expect(parseFacetKey('@x')).toBeUndefined();
    expect(parseFacetKey('state@')).toBeUndefined();
  });
});

describe('getFacet', () => {
  const b = bundle({ 'state@default': { n: 1 }, 'memory@recorded': { n: 2 } });
  it('returns the default variant', () => {
    expect(getFacet<{ n: number }>(b, 'state')).toEqual({ n: 1 });
  });
  it('returns a named variant', () => {
    expect(getFacet(b, 'memory', 'recorded')).toEqual({ n: 2 });
  });
  it('returns undefined when absent', () => {
    expect(getFacet(b, 'memory')).toBeUndefined();
  });
});

describe('availableFacetKinds', () => {
  it('lists distinct kinds across variants, skipping undefined entries', () => {
    const b = bundle({
      'state@default': {},
      'memory@recorded': {},
      'memory@x86_64-linux-gnu': {},
      'values@default': undefined,
    });
    expect(availableFacetKinds(b)).toEqual(['state', 'memory']);
  });
  it('returns empty for no facets', () => {
    expect(availableFacetKinds(bundle({}))).toEqual([]);
  });
});
