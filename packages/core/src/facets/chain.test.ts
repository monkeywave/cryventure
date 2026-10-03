import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { chainActiveAt, chainActiveNodesAt, chainEdgeKey, chainIssues, chainLabelRefs, chainLanes, type ChainFacet, type ChainNode } from './chain.ts';

const node = (id: string, block: number, activeAt: number, kind: ChainNode['kind'] = 'xor'): ChainNode => ({
  id,
  block,
  kind,
  label: i18nRef(`chain.${kind}`),
  bytes: [0],
  activeAt,
});

/** CBC-shaped two-lane chain: iv → b0.xor ← b0.in, b0.xor → b0.out → b1.xor ← b1.in. */
const chain = (extra: Partial<ChainFacet> = {}): ChainFacet => ({
  kind: 'chain',
  schemaVersion: 1,
  mode: 'cbc',
  direction: 'encrypt',
  formula: i18nRef('chain.formula.cbc'),
  nodes: [
    node('iv', -1, -1, 'iv'),
    node('b0.in', 0, -1, 'input'),
    node('b0.xor', 0, 0),
    node('b0.out', 0, 1, 'output'),
    node('b1.in', 1, -1, 'input'),
    node('b1.xor', 1, 2),
  ],
  edges: [
    { from: 'iv', to: 'b0.xor', activeAt: 0 },
    { from: 'b0.in', to: 'b0.xor', activeAt: 0 },
    { from: 'b0.xor', to: 'b0.out', activeAt: 1 },
    { from: 'b0.out', to: 'b1.xor', activeAt: 2 },
    { from: 'b1.in', to: 'b1.xor', activeAt: 2 },
  ],
  ...extra,
});

describe('chainIssues', () => {
  it('accepts a well-formed chain', () => {
    expect(chainIssues(chain(), 3)).toEqual([]);
  });
  it('rejects duplicate node ids', () => {
    const facet = chain();
    expect(chainIssues({ ...facet, nodes: [...facet.nodes, node('iv', -1, -1, 'iv')] }, 3)).toEqual(['chain: duplicate node id "iv"']);
  });
  it('rejects edges with unknown endpoints', () => {
    const facet = chain();
    expect(chainIssues({ ...facet, edges: [...facet.edges, { from: 'nope', to: 'gone', activeAt: 0 }] }, 3)).toEqual([
      'chain: edge nope->gone has unknown source "nope"',
      'chain: edge nope->gone has unknown target "gone"',
    ]);
  });
  it('rejects activeAt outside [-1, stepCount-1]', () => {
    expect(chainIssues(chain(), 2)).toEqual([
      'chain: node "b1.xor" activeAt 2 outside -1..1',
      'chain: edge b0.out->b1.xor activeAt 2 outside -1..1',
      'chain: edge b1.in->b1.xor activeAt 2 outside -1..1',
    ]);
    const facet = chain();
    expect(chainIssues({ ...facet, nodes: [...facet.nodes, node('pad', -1, -2, 'pad')] }, 3)).toEqual([
      'chain: node "pad" activeAt -2 outside -1..2',
    ]);
  });
  it('rejects a node active before a source that feeds it', () => {
    const facet = chain();
    const nodes = facet.nodes.map((n) => (n.id === 'b1.xor' ? { ...n, activeAt: 0 } : n));
    expect(chainIssues({ ...facet, nodes, edges: facet.edges.map((e) => ({ ...e, activeAt: Math.min(e.activeAt, 1) })) }, 3)).toEqual([
      'chain: node "b1.xor" activeAt 0 precedes its source "b0.out" (1)',
    ]);
  });
  it('rejects an edge active before its source', () => {
    const facet = chain();
    const edges = facet.edges.map((e) => (e.from === 'b0.xor' ? { ...e, activeAt: -1 } : e));
    expect(chainIssues({ ...facet, edges }, 3)).toEqual(['chain: edge b0.xor->b0.out activeAt -1 precedes its source (0)']);
  });
});

describe('chainActiveAt', () => {
  it('returns the nodes and edges active at a step (cumulative)', () => {
    const initial = chainActiveAt(chain(), -1);
    expect([...initial.nodes]).toEqual(['iv', 'b0.in', 'b1.in']);
    expect([...initial.edges]).toEqual([]);
    const atZero = chainActiveAt(chain(), 0);
    expect([...atZero.nodes]).toEqual(['iv', 'b0.in', 'b0.xor', 'b1.in']);
    expect([...atZero.edges]).toEqual([chainEdgeKey({ from: 'iv', to: 'b0.xor' }), 'b0.in->b0.xor']);
    expect(chainActiveAt(chain(), 2).nodes.size).toBe(6);
  });

  it('chainActiveNodesAt returns the same nodes without the edges', () => {
    for (const step of [-1, 0, 2]) expect(chainActiveNodesAt(chain(), step)).toEqual(chainActiveAt(chain(), step).nodes);
  });
});

describe('chainLabelRefs / chainLanes', () => {
  it('lists node labels and the formula', () => {
    const keys = chainLabelRefs(chain()).map((ref) => ref.key);
    expect(keys).toEqual(['chain.iv', 'chain.input', 'chain.xor', 'chain.output', 'chain.input', 'chain.xor', 'chain.formula.cbc']);
  });
  it('lists block lanes in ascending order including -1', () => {
    expect(chainLanes(chain())).toEqual([-1, 0, 1]);
    expect(chainLanes(chain({ nodes: [] }))).toEqual([]);
  });
});
