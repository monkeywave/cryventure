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

  it('requires every chain and wire valueRef to exist in the values facet', () => {
    const values = { kind: 'values', schemaVersion: 1, values: [{ id: 'iv', labelKey: 'plugin.x.value.iv', role: 'nonce', bytes: [1], createdAt: -1 }] };
    const refChain: ChainFacet = { ...chain, nodes: chain.nodes.map((node, index) => ({ ...node, valueRef: index === 0 ? 'iv' : 'gone' })) };
    const refWire: WireFacet = { ...wire, segments: wire.segments.map((segment) => ({ ...segment, valueRef: 'missing' })) };
    expect(modeFacetIssues(bundleWith({ chain: refChain, wire: refWire, values }, 1))).toEqual([
      'chain: node "b0.out" valueRef "gone" is not in the values facet',
      'wire: segment "c" valueRef "missing" is not in the values facet',
    ]);
    expect(modeFacetIssues(bundleWith({ chain: refChain }, 1))).toHaveLength(2);
  });

  it('rejects wire highlights on bytes of a segment that is not available yet', () => {
    const late: WireFacet = { ...wire, segments: [{ ...wire.segments[0]!, availableAt: 1 }], activeAt: [{ step: 0, offsets: [0] }] };
    const lateChain: ChainFacet = { ...chain, nodes: chain.nodes.map((node) => ({ ...node, block: -1 })) };
    expect(modeFacetIssues(bundleWith({ chain: lateChain, wire: late }, 2))).toEqual(['wire: activeAt step 0 highlights offset 0 of segment "c", available only from step 1']);
  });

  it('requires a chain output node to get its value when the wire segment of its block is sent', () => {
    const sent: WireFacet = { ...wire, segments: [{ ...wire.segments[0]!, block: 0, availableAt: 1 }], activeAt: [{ step: 1, offsets: [0] }] };
    expect(modeFacetIssues(bundleWith({ chain, wire: sent }, 2))).toEqual(['chain: output node "b0.out" activeAt 0 differs from wire segment "c" availableAt 1']);
    const matching: WireFacet = { ...sent, segments: [{ ...sent.segments[0]!, availableAt: 0 }], activeAt: [{ step: 0, offsets: [0] }] };
    expect(modeFacetIssues(bundleWith({ chain, wire: matching }, 2))).toEqual([]);
    const unpaired: WireFacet = { ...sent, segments: [{ ...sent.segments[0]!, block: 3 }] };
    expect(modeFacetIssues(bundleWith({ chain, wire: unpaired }, 2))).toEqual([]);
  });
});

describe('modeFacetRefs', () => {
  it('lists chain and wire label refs', () => {
    expect(modeFacetRefs(bundleWith({ chain, wire }, 1)).map((ref) => ref.key)).toEqual(['plugin.x.in', 'plugin.x.out', 'plugin.x.formula', 'plugin.x.c']);
    expect(modeFacetRefs(bundleWith({}, 0))).toEqual([]);
  });
});
