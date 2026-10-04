import { describe, expect, it } from 'vitest';
import type { DeriverManifest, TraceBundle } from '@cryventure/core';
import { producerRegistry } from './registry.ts';
import { deriversApplicableToAny, sampleApplicableDerivers, sampleBundles, sampleZoomTargets, zoomTargetsOf } from './sampleDerivers.ts';

const deriver = (id: string, appliesTo?: (bundle: TraceBundle) => boolean) =>
  ({ kind: 'deriver', id, apiVersion: 1, from: ['state'], provides: ['memory'], appliesTo, load: async () => ({}) }) as unknown as DeriverManifest;
const bundle = (id: string) => ({ producer: { id }, facets: { 'state@default': {} } }) as unknown as TraceBundle;

describe('sampleBundles', () => {
  it('runs the defaults and every preset', async () => {
    const aes = producerRegistry.require('aes');
    expect(await sampleBundles(aes)).toHaveLength(1 + aes.presets.length);
  });
});

describe('deriversApplicableToAny', () => {
  it('keeps a deriver that applies to at least one bundle and drops the rest', () => {
    const onlyB = deriver('b', (sample) => sample.producer.id === 'b');
    const never = deriver('never', () => false);
    const always = deriver('always');
    expect(deriversApplicableToAny([bundle('a'), bundle('b')], [onlyB, never, always])).toEqual([onlyB, always]);
    expect(deriversApplicableToAny([], [always])).toEqual([]);
  });
});

describe('sampleApplicableDerivers', () => {
  it('offers the AES derivers to aes only, and nothing for unknown producers', () => {
    const ids = (producerId: string) => sampleApplicableDerivers(producerId)?.map((entry) => entry.id);
    expect(ids('aes')).toEqual(expect.arrayContaining(['memory', 'isa-x86', 'isa-armv8']));
    for (const producerId of ['ctr', 'xor', 'gcm', 'cbc']) expect(ids(producerId)).toEqual([]);
    expect(sampleApplicableDerivers('nope')).toBeUndefined();
  });
});

describe('zoomTargetsOf', () => {
  it('collects the producers derivation nodes zoom into, each once, sorted', () => {
    const node = (producerId?: string) => ({ id: 'n', label: { key: 'x' }, bytes: [], op: 'hmac', inputs: [], ...(producerId === undefined ? {} : { zoom: { producerId, params: {} } }) });
    const derivation = { kind: 'derivation', schemaVersion: 1, nodes: [node('sha256'), node(), node('hmac'), node('sha256')] };
    const withDerivation = { producer: { id: 'x' }, facets: { 'state@default': {}, 'derivation@default': derivation } } as unknown as TraceBundle;
    expect(zoomTargetsOf([withDerivation, bundle('a')])).toEqual(['hmac', 'sha256']);
  });
});

describe('sampleZoomTargets', () => {
  it('names the labs the MAC/KDF samples zoom into; none for labs without zoom links', () => {
    expect(sampleZoomTargets('hkdf')).toEqual(['hmac']);
    expect(sampleZoomTargets('pbkdf2')).toEqual(['hmac']);
    expect(sampleZoomTargets('hmac')).toContain('sha256');
    expect(sampleZoomTargets('aes')).toEqual([]);
    expect(sampleZoomTargets('nope')).toEqual([]);
  });
});
