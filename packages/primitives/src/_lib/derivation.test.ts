import { validateDerivationFacet } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { DerivationBuilder } from './derivation.ts';

const NS = 'plugin.test';
const ZOOM = { producerId: 'hmac', params: { hash: 'sha256:sha-256' } };

describe('DerivationBuilder', () => {
  it('labels nodes under <ns>.derivation, returns their ids and omits absent optionals', () => {
    const builder = new DerivationBuilder(NS);
    expect(builder.add({ id: 'secret', label: 'secret', bytes: Uint8Array.of(1, 2), op: 'input', valueRef: 'secret' })).toBe('secret');
    expect(builder.add({ id: 'out', label: 'output', labelParams: { length: 1 }, bytes: [1], op: 'truncate', inputs: ['secret'], result: true, step: 3, zoom: undefined })).toBe('out');
    const facet = builder.facet();
    expect(facet.title).toEqual({ key: `${NS}.derivation.title` });
    expect(facet.nodes).toEqual([
      { id: 'secret', label: { key: `${NS}.derivation.secret` }, bytes: [1, 2], op: 'input', inputs: [], valueRef: 'secret' },
      { id: 'out', label: { key: `${NS}.derivation.output`, params: { length: 1 } }, bytes: [1], op: 'truncate', inputs: ['secret'], result: true, step: 3 },
    ]);
    expect(facet).not.toHaveProperty('groups');
    expect(validateDerivationFacet(facet)).toEqual([]);
  });

  it('keeps every optional part in the facet order group, result, valueRef, step, zoom', () => {
    const builder = new DerivationBuilder(NS);
    builder.add({ id: 't', label: 't', bytes: [7], op: 'xor', zoom: ZOOM, step: 2, valueRef: 't', result: true, group: 1 });
    expect(Object.keys(builder.nodes[0]!)).toEqual(['id', 'label', 'bytes', 'op', 'inputs', 'group', 'result', 'valueRef', 'step', 'zoom']);
  });

  it('labels under a custom prefix and adds the groups when given', () => {
    const builder = new DerivationBuilder(NS, 'node');
    builder.add({ id: 'a', label: 'a', bytes: [], op: 'input' });
    const groups = [{ id: 1, label: { key: `${NS}.node.group` } }];
    const facet = builder.facet(groups);
    expect(facet.title).toEqual({ key: `${NS}.node.title` });
    expect(facet.nodes[0]!.label).toEqual({ key: `${NS}.node.a` });
    expect(facet.groups).toEqual(groups);
  });

  it('hands out a copy of its nodes', () => {
    const builder = new DerivationBuilder(NS);
    builder.add({ id: 'a', label: 'a', bytes: [], op: 'input' });
    builder.nodes.pop();
    expect(builder.nodes).toHaveLength(1);
  });
});
