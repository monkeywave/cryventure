import { assertTopologicalOrder, parseHexOrThrow, toHex, validateDerivationFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { addChainNodes, addPrfInputNodes, PrfDerivationBuilder } from './derivation.ts';
import { concatBytes, labelSeed, pHashChain } from './pHash.ts';
import { HMAC_SHA256 } from './testMacs.ts';

const NS = 'plugin.test-prf';
const SECRET = parseHexOrThrow('0102030405');
const JOINED = labelSeed('test label', parseHexOrThrow('aabb'));
const CHAIN = pHashChain(HMAC_SHA256, SECRET, JOINED, 40);

describe('PrfDerivationBuilder', () => {
  it('labels nodes under <ns>.derivation and omits absent optionals', () => {
    const builder = new PrfDerivationBuilder(NS);
    expect(builder.add({ id: 'secret', label: 'secret', bytes: SECRET, op: 'input', valueRef: 'secret' })).toBe('secret');
    builder.add({ id: 'out', label: 'output', labelParams: { length: 5 }, bytes: [1], op: 'truncate', inputs: ['secret'], result: true, step: 3, zoom: undefined });
    const facet = builder.facet();
    expect(facet.title).toEqual({ key: `${NS}.derivation.title` });
    expect(facet.nodes).toEqual([
      { id: 'secret', label: { key: `${NS}.derivation.secret` }, bytes: [1, 2, 3, 4, 5], op: 'input', inputs: [], valueRef: 'secret' },
      { id: 'out', label: { key: `${NS}.derivation.output`, params: { length: 5 } }, bytes: [1], op: 'truncate', inputs: ['secret'], result: true, step: 3 },
    ]);
  });
});

describe('addChainNodes', () => {
  const builder = new PrfDerivationBuilder(NS);
  builder.add({ id: 'secret', label: 'secret', bytes: SECRET, op: 'input' });
  builder.add({ id: 'labelSeed', label: 'labelSeed', bytes: JOINED, op: 'concat' });
  const steps = [
    { a: 1, p: 2 },
    { a: 3, p: 4 },
  ];
  const ids = addChainNodes(builder, { prefix: 'prf', mac: HMAC_SHA256, key: SECRET, keyNodeId: 'secret', labelSeed: JOINED, labelSeedNodeId: 'labelSeed', chain: CHAIN, steps });
  const facet = builder.facet();
  const node = (id: string) => facet.nodes.find((candidate) => candidate.id === id)!;

  it('returns the P node ids and adds A(i), P(i) per block in topological order', () => {
    expect(ids).toEqual(['prf/p/1', 'prf/p/2']);
    expect(facet.nodes.map((n) => n.id)).toEqual(['secret', 'labelSeed', 'prf/a/1', 'prf/p/1', 'prf/a/2', 'prf/p/2']);
    expect(() => assertTopologicalOrder(facet)).not.toThrow();
    expect(() => validateDerivationFacet(facet)).not.toThrow();
  });

  it('chains A(i) from A(i−1) (A(0) = label ‖ seed), each keyed by the secret', () => {
    expect(node('prf/a/1')).toMatchObject({ op: 'hmac', inputs: ['labelSeed', 'secret'], step: 1, bytes: Array.from(CHAIN.a[0]!) });
    expect(node('prf/a/2')).toMatchObject({ inputs: ['prf/a/1', 'secret'], step: 3, label: { key: `${NS}.derivation.a`, params: { prf: 'P_SHA-256', i: 2 } } });
  });

  it('marks P(i) as results computed from A(i), label ‖ seed and the secret', () => {
    expect(node('prf/p/2')).toMatchObject({ op: 'hmac', inputs: ['prf/a/2', 'labelSeed', 'secret'], result: true, step: 4, bytes: Array.from(CHAIN.p[1]!) });
    expect(node('prf/a/1').result).toBeUndefined();
  });

  it('zooms each HMAC node into the hmac lab with that call’s key and message', () => {
    expect(node('prf/a/1').zoom?.params['input']).toBe(toHex(JOINED));
    expect(node('prf/a/2').zoom?.params['input']).toBe(toHex(CHAIN.a[0]!));
    expect(node('prf/p/2').zoom?.params['input']).toBe(toHex(concatBytes(CHAIN.a[1]!, JOINED)));
    expect(node('prf/p/2').zoom?.params['key']).toBe('0102030405');
  });
});

describe('addPrfInputNodes', () => {
  it('adds secret, label and seed, then label ‖ seed at the seed step', () => {
    const builder = new PrfDerivationBuilder(NS);
    const seed = parseHexOrThrow('aabb');
    expect(addPrfInputNodes(builder, { secret: SECRET, label: 'test label', seed, labelSeed: JOINED }, 3)).toEqual({ secretId: 'secret', labelSeedId: 'labelSeed' });
    const nodes = builder.facet().nodes;
    expect(nodes.map((node) => [node.id, node.op, node.inputs])).toEqual([['secret', 'input', []], ['label', 'input', []], ['seed', 'input', []], ['labelSeed', 'concat', ['label', 'seed']]]);
    expect(nodes[1]!.label).toEqual({ key: `${NS}.derivation.label`, params: { label: 'test label' } });
    expect(nodes[3]).toMatchObject({ bytes: Array.from(JOINED), valueRef: 'labelSeed', step: 3 });
    expect(nodes[0]).toMatchObject({ bytes: Array.from(SECRET), valueRef: 'secret' });
  });
});
