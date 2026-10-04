import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import {
  assertTopologicalOrder,
  derivationAncestors,
  derivationInputs,
  derivationNode,
  isResultNode,
  validateDerivationFacet,
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

describe('validateDerivationFacet', () => {
  const zoomed = (zoom: unknown): unknown => ({ ...facet, nodes: [{ ...node('a'), zoom }] });

  it('accepts a facet with a title and lab zooms', () => {
    const titled: DerivationFacet = { ...facet, title: i18nRef('t.hkdf'), nodes: [{ ...node('a'), zoom: { producerId: 'sha256', params: { input: 'ab', encoding: 'hex' } } }] };
    expect(validateDerivationFacet(titled)).toEqual([]);
    expect(validateDerivationFacet(facet)).toEqual([]);
  });

  it('rejects a non-object, a wrong kind, schemaVersion or nodes', () => {
    expect(validateDerivationFacet(null)).toEqual(['derivation: facet is not an object']);
    expect(validateDerivationFacet({ ...facet, kind: 'math' })).toEqual(['derivation: kind math is not "derivation"']);
    expect(validateDerivationFacet({ ...facet, schemaVersion: 2 })).toEqual(['derivation: schemaVersion 2 is not 1']);
    expect(validateDerivationFacet({ ...facet, nodes: 'x' })).toEqual(['derivation: nodes is not an array']);
  });

  it('rejects a zoom whose producerId is not kebab-case', () => {
    expect(validateDerivationFacet(zoomed({ producerId: 'Sha256', params: {} }))).toEqual(['derivation: node "a": zoom.producerId Sha256 is not a kebab-case producer id']);
    expect(validateDerivationFacet(zoomed({ producerId: 7, params: {} }))).toEqual(['derivation: node "a": zoom.producerId 7 is not a kebab-case producer id']);
  });

  it('rejects zoom params that are not a record of strings', () => {
    expect(validateDerivationFacet(zoomed({ producerId: 'sha256', params: { n: 1 } }))).toEqual(['derivation: node "a": zoom.params.n is not a string']);
    expect(validateDerivationFacet(zoomed({ producerId: 'sha256', params: [] }))).toEqual(['derivation: node "a": zoom.params is not a record of strings']);
    expect(validateDerivationFacet(zoomed('sha256'))).toEqual(['derivation: node "a": zoom is not an object']);
  });

  it('rejects a malformed title and node label', () => {
    expect(validateDerivationFacet({ ...facet, title: { key: '' } })).toEqual(['derivation title: not a well-formed I18nRef']);
    expect(validateDerivationFacet({ ...facet, nodes: [{ ...node('a'), label: 'x' }] })).toEqual(['derivation: node "a" label: not a well-formed I18nRef']);
  });
});
