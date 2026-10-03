import { facetKey, type ChainFacet, type TraceBundle, type WireFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { modeFacetIssues, modeFacetRefs } from './modeFacetChecks.ts';

const label = (key: string) => ({ key });
const chain: ChainFacet = {
  kind: 'chain',
  schemaVersion: 1,
  mode: 'ecb',
  direction: 'encrypt',
  formula: label('plugin.x.formula'),
  nodes: [
    { id: 'b0.in', block: 0, kind: 'input', label: label('plugin.x.in'), bytes: [1], activeAt: -1 },
    { id: 'b0.out', block: 0, kind: 'output', label: label('plugin.x.out'), bytes: [2], activeAt: 0 },
  ],
  edges: [{ from: 'b0.in', to: 'b0.out', activeAt: 0 }],
};
const wire: WireFacet = { kind: 'wire', schemaVersion: 1, segments: [{ id: 'c', role: 'ciphertext', label: label('plugin.x.c'), bytes: [2] }], activeAt: [{ step: 0, offsets: [0] }] };

function bundleWith(facets: Record<string, unknown>, steps: number): TraceBundle {
  const state = { steps: Array.from({ length: steps }, () => ({})) };
  return { schemaVersion: 1, producer: { kind: 'primitive', id: 'x', apiVersion: 1 }, provenance: 'modeled', params: {}, output: {}, facets: Object.fromEntries(Object.entries({ state, ...facets }).map(([kind, facet]) => [facetKey(kind), facet])) } as TraceBundle;
}

describe('modeFacetIssues', () => {
  it('passes valid chain and wire facets and bundles without them', () => {
    expect(modeFacetIssues(bundleWith({ chain, wire }, 1))).toEqual([]);
    expect(modeFacetIssues(bundleWith({}, 0))).toEqual([]);
  });

  it('checks step ranges against the state facet', () => {
    expect(modeFacetIssues(bundleWith({ chain, wire }, 0)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('modeFacetRefs', () => {
  it('lists chain and wire label refs', () => {
    expect(modeFacetRefs(bundleWith({ chain, wire }, 1)).map((ref) => ref.key)).toEqual(['plugin.x.in', 'plugin.x.out', 'plugin.x.formula', 'plugin.x.c']);
    expect(modeFacetRefs(bundleWith({}, 0))).toEqual([]);
  });
});
