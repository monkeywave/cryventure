import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import {
  assertTopologicalOrder,
  derivationAncestors,
  derivationInputs,
  derivationNode,
  isResultNode,
  type DerivationFacet,
  type DerivationNode,
} from './derivation.ts';

const node = (id: string, inputs: string[] = []): DerivationNode => ({ id, label: i18nRef(`l.${id}`), bytes: [], op: 'xor', inputs });
const facet: DerivationFacet = {
  kind: 'derivation',
  schemaVersion: 1,
  nodes: [node('a'), node('b'), node('c', ['a', 'b']), node('d', ['c', 'a'])],
};

describe('derivation facet helpers', () => {
  it('finds nodes by id', () => {
    expect(derivationNode(facet, 'c')?.inputs).toEqual(['a', 'b']);
    expect(derivationNode(facet, 'zz')).toBeUndefined();
  });
  it('lists direct inputs', () => expect(derivationInputs(facet, 'd').map((n) => n.id)).toEqual(['c', 'a']));
  it('returns no inputs for unknown nodes', () => expect(derivationInputs(facet, 'zz')).toEqual([]));
  it('lists every ancestor once', () => expect(derivationAncestors(facet, 'd').map((n) => n.id)).toEqual(['c', 'a', 'b']));
  it('accepts topologically ordered facets', () => expect(() => assertTopologicalOrder(facet)).not.toThrow());
  it('rejects forward references and duplicates', () => {
    expect(() => assertTopologicalOrder({ ...facet, nodes: [node('x', ['y']), node('y')] })).toThrow(/before it is defined/);
    expect(() => assertTopologicalOrder({ ...facet, nodes: [node('x'), node('x')] })).toThrow(/duplicate/);
  });
});

describe('isResultNode', () => {
  it('treats grouped nodes as results and ungrouped ones as intermediates', () => {
    expect(isResultNode({ group: 0 })).toBe(true);
    expect(isResultNode({ group: 3 })).toBe(true);
    expect(isResultNode({})).toBe(false);
  });
});
