import { describe, expect, it } from 'vitest';
import { ChainBuilder } from '../facets/modeFacetBuilders.ts';
import type { BlockCipher } from '../ports.ts';
import { addPadNode, addUnpadNode, blockModeValues, chainLabel, cipherName, cipherZoom, laneNodeId } from './blockModeFacets.ts';
import { toyCipher } from './testCiphers.ts';

const NS = 'plugin.demo';

describe('cipherName / laneNodeId / chainLabel', () => {
  it('names the cipher, a lane node and a chain label', () => {
    expect(cipherName(toyCipher)).toBe('TOY');
    expect(laneNodeId(2, 'xor')).toBe('b2.xor');
    expect(chainLabel(NS, 'iv')).toEqual({ key: `${NS}.chain.iv` });
    expect(chainLabel(NS, 'plaintext', 3)).toEqual({ key: `${NS}.chain.plaintext`, params: { n: 3 } });
  });
});

describe('cipherZoom', () => {
  it('zooms into the cipher lab with the params the cipher names', () => {
    const cipher: BlockCipher = { ...toyCipher, labParams: (key, block) => ({ k: String(key[0]), b: String(block[0]) }) };
    expect(cipherZoom(cipher, Uint8Array.of(5), [6])).toEqual({ zoom: { producerId: 'toy', params: { k: '5', b: '6' } } });
  });

  it('does not zoom when the cipher has no lab params', () => expect(cipherZoom(toyCipher, Uint8Array.of(5), [6])).toEqual({}));
});

describe('addPadNode / addUnpadNode', () => {
  const lane = (chain: ChainBuilder, index: number) => {
    chain.node({ id: laneNodeId(index, 'input'), block: index, kind: 'input', label: chainLabel(NS, 'plaintext'), bytes: [], activeAt: -1 });
    chain.node({ id: laneNodeId(index, 'output'), block: index, kind: 'output', label: chainLabel(NS, 'ciphertext'), bytes: [], activeAt: 3 });
  };

  it('links the pad node into the last lane input', () => {
    const chain = new ChainBuilder();
    [0, 1].forEach((index) => lane(chain, index));
    addPadNode(chain, NS, { blocks: [{}, {}], processed: [], pad: { step: 0, bytes: [2, 2] } });
    const facet = chain.toFacet({ mode: 'x', direction: 'encrypt', formula: { key: 'f' } });
    expect(facet.nodes.at(-1)).toEqual({ id: 'pad', block: -1, kind: 'pad', label: { key: `${NS}.chain.pad` }, bytes: [2, 2], activeAt: 0 });
    expect(facet.edges).toEqual([{ from: 'pad', to: 'b1.input', activeAt: -1 }]);
  });

  it('links the last lane output into the unpad node, showing the pad bytes or the bad last byte', () => {
    const facetWith = (unpad: Parameters<typeof addUnpadNode>[2]['unpad']) => {
      const chain = new ChainBuilder();
      lane(chain, 0);
      addUnpadNode(chain, NS, { blocks: [{}], processed: [9, 9, 2, 2], ...(unpad === undefined ? {} : { unpad }) });
      return chain.toFacet({ mode: 'x', direction: 'decrypt', formula: { key: 'f' } });
    };
    const valid = facetWith({ step: 4, result: { ok: true, data: Uint8Array.of(9, 9), padLength: 2 } });
    expect(valid.nodes.at(-1)).toEqual({ id: 'unpad', block: 0, kind: 'pad', label: { key: `${NS}.chain.unpad` }, bytes: [2, 2], activeAt: 4 });
    expect(valid.edges).toEqual([{ from: 'b0.output', to: 'unpad', activeAt: 4 }]);
    const invalid = facetWith({ step: 4, result: { ok: false, reason: 'pad-too-long' } });
    expect(invalid.nodes.at(-1)).toMatchObject({ label: { key: `${NS}.chain.unpadInvalid` }, bytes: [2] });
    expect(facetWith(undefined).nodes.map((node) => node.id)).toEqual(['b0.input', 'b0.output']);
  });
});

describe('blockModeValues', () => {
  it('declares key, the extra initial values, the input and the first output', () => {
    const extra = { id: 'iv', labelKey: `${NS}.value.iv`, role: 'nonce' as const, bytes: [4], createdAt: -1 };
    const facet = blockModeValues(NS, { direction: 'decrypt', key: [1], data: [2], outputs: { padded: [3] }, lastStep: 7, initial: [extra] });
    expect(facet.values.map((value) => [value.id, value.labelKey, value.role, value.bytes, value.createdAt])).toEqual([
      ['key', `${NS}.value.key`, 'key', [1], -1],
      ['iv', `${NS}.value.iv`, 'nonce', [4], -1],
      ['ciphertext', `${NS}.value.ciphertext`, 'ciphertext', [2], -1],
      ['padded', `${NS}.value.padded`, 'plaintext', [3], 7],
    ]);
  });
});
