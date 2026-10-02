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

  it('prefers an explicit result flag over the group convention', () => {
    expect(isResultNode({ result: true })).toBe(true);
    expect(isResultNode({ group: 2, result: false })).toBe(false);
  });
});

describe('derivation node index', () => {
  it('returns the first node for a repeated id and stays consistent across calls', () => {
    const first = node('x');
    const repeated: DerivationFacet = { kind: 'derivation', schemaVersion: 1, nodes: [first, { ...node('x'), op: 'other' }] };
    expect(derivationNode(repeated, 'x')).toBe(first);
    expect(derivationNode(repeated, 'x')).toBe(first);
  });

  it('accepts optional group labels', () => {
    const labelled: DerivationFacet = { ...facet, groups: [{ id: 0, label: i18nRef('g.0') }] };
    expect(derivationInputs(labelled, 'c').map((n) => n.id)).toEqual(['a', 'b']);
  });
});
