import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { chainIssues } from './chain.ts';
import { ChainBuilder, WireBuilder } from './modeFacetBuilders.ts';
import { wireIssues } from './wire.ts';

const label = i18nRef('plugin.demo.chain.x');

describe('ChainBuilder', () => {
  it('collects nodes and links edges active when their target gets its value', () => {
    const chain = new ChainBuilder();
    chain.node({ id: 'iv', block: -1, kind: 'iv', label, bytes: [1], activeAt: -1 });
    chain.node({ id: 'b0.input', block: 0, kind: 'input', label, bytes: [2], activeAt: -1 });
    chain.node({ id: 'b0.xor', block: 0, kind: 'xor', label, bytes: [3], activeAt: 0 });
    chain.link(['iv', 'b0.input'], 'b0.xor');
    const facet = chain.toFacet({ mode: 'cbc', direction: 'encrypt', formula: label });
    expect(facet).toMatchObject({ kind: 'chain', schemaVersion: 1, mode: 'cbc', direction: 'encrypt', formula: label });
    expect(facet.edges).toEqual([
      { from: 'iv', to: 'b0.xor', activeAt: 0 },
      { from: 'b0.input', to: 'b0.xor', activeAt: 0 },
    ]);
    expect(chainIssues(facet, 1)).toEqual([]);
  });

  it('delays a node, so edges linked into it afterwards are active from the new step', () => {
    const chain = new ChainBuilder();
    chain.node({ id: 'b0.input', block: 0, kind: 'input', label, bytes: [2], activeAt: -1 });
    chain.node({ id: 'pad', block: -1, kind: 'pad', label, bytes: [1], activeAt: 0 });
    chain.delay('b0.input', 0);
    chain.link('pad', 'b0.input');
    const facet = chain.toFacet({ mode: 'ecb', direction: 'encrypt', formula: label });
    expect(facet.nodes.map((node) => [node.id, node.activeAt])).toEqual([['b0.input', 0], ['pad', 0]]);
    expect(facet.edges).toEqual([{ from: 'pad', to: 'b0.input', activeAt: 0 }]);
    expect(() => chain.delay('nope', 0)).toThrow(RangeError);
  });

  it('throws when linking to an unknown target', () => {
    expect(() => new ChainBuilder().link('a', 'b')).toThrow(RangeError);
  });
});

describe('WireBuilder', () => {
  it('returns each segment’s global offsets and merges activations per step in order', () => {
    const wire = new WireBuilder();
    expect(wire.segment({ id: 'iv', role: 'iv', label, bytes: [1, 2] })).toEqual([0, 1]);
    expect(wire.segment({ id: 'c0', role: 'ciphertext', label, bytes: [3, 4, 5], block: 0 })).toEqual([2, 3, 4]);
    wire.activate(3, [2]);
    wire.activate(-1, [0, 1]);
    wire.activate(3, [3, 4]);
    const facet = wire.toFacet();
    expect(facet.activeAt).toEqual([
      { step: -1, offsets: [0, 1] },
      { step: 3, offsets: [2, 3, 4] },
    ]);
    expect(wireIssues(facet, 4)).toEqual([]);
  });

  it('keeps the availableAt a segment is created with', () => {
    const wire = new WireBuilder();
    const iv = wire.segment({ id: 'iv', role: 'iv', label, bytes: [1, 2] });
    const c0 = wire.segment({ id: 'c0', role: 'ciphertext', label, bytes: [3, 4], block: 0, availableAt: 2 });
    wire.activate(-1, iv);
    wire.activate(2, c0);
    const facet = wire.toFacet();
    expect(facet.segments.map((segment) => segment.availableAt)).toEqual([undefined, 2]);
    expect(wireIssues(facet, 3)).toEqual([]);
  });

  it('leaves segments that are only activated present from the start', () => {
    const wire = new WireBuilder();
    wire.activate(1, wire.segment({ id: 'c0', role: 'ciphertext', label, bytes: [1] }));
    expect(wire.toFacet().segments[0]).not.toHaveProperty('availableAt');
  });

  it('omits activeAt when nothing is activated', () => {
    expect(new WireBuilder().toFacet()).toEqual({ kind: 'wire', schemaVersion: 1, segments: [] });
  });
});
