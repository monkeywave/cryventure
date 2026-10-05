import { describe, expect, it } from 'vitest';
import { paramFieldsOf, portOptions, portParamFields, type DeriverManifest, type TraceBundle } from '@cryventure/core';
import { producerRegistry } from './registry.ts';
import { deriversApplicableToAny, labSamples, memberSampleParams, sampleApplicableDerivers, sampleBundles, zoomTargetsOf } from './sampleDerivers.ts';

const deriver = (id: string, appliesTo?: (bundle: TraceBundle) => boolean) =>
  ({ kind: 'deriver', id, apiVersion: 1, from: ['state'], provides: ['memory'], appliesTo, load: async () => ({}) }) as unknown as DeriverManifest;
const bundle = (id: string) => ({ producer: { id }, facets: { 'state@default': {} } }) as unknown as TraceBundle;

describe('sampleBundles', () => {
  it('runs the defaults and every preset', async () => {
    const aes = producerRegistry.require('aes');
    expect(await sampleBundles(aes)).toHaveLength(1 + aes.presets.length);
  });

  it("runs only the defaults of a producer that runs in a worker (its presets can be heavy)", async () => {
    const pbkdf2 = producerRegistry.require('pbkdf2');
    expect(pbkdf2.runIn).toBe('worker');
    expect(pbkdf2.presets.length).toBeGreaterThan(0);
    expect(await sampleBundles(pbkdf2)).toHaveLength(1);
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

describe('memberSampleParams', () => {
  it("sets each member field of the defaults to each of its options (docs/M7.md §1b)", () => {
    const hmac = producerRegistry.require('hmac');
    const hashField = portParamFields(paramFieldsOf(hmac)).find((field) => field.member === true)!;
    const options = portOptions(producerRegistry.list(), hashField).map((option) => option.value);
    expect(options.length).toBeGreaterThan(1);
    expect(memberSampleParams(hmac).map((params) => (params as Record<string, unknown>)[hashField.name])).toEqual(options);
    expect(memberSampleParams(hmac)[0]).toMatchObject({ ...(hmac.defaults as object), [hashField.name]: options[0] });
  });

  it('is empty for a producer without member fields', () => {
    expect(memberSampleParams(producerRegistry.require('aes'))).toEqual([]);
  });
});

describe('labSamples', () => {
  const targets = (producerId: string) => zoomTargetsOf(labSamples(producerId));

  it("zooms the hmac lab into the lab of every Hash producer a member can come from", () => {
    const hashProducers = producerRegistry.list().filter((producer) => producer.portMembers?.Hash !== undefined).map((producer) => producer.id);
    expect(hashProducers.length).toBeGreaterThan(1);
    expect(targets('hmac')).toEqual(expect.arrayContaining(hashProducers));
  });

  it('zooms the KDF/PRF labs into hmac whichever MAC member is picked; no zoom targets for labs without zoom links or unknown ones', () => {
    for (const producerId of ['hkdf', 'pbkdf2', 'tls12-prf']) expect(targets(producerId)).toEqual(['hmac']);
    expect(targets('aes')).toEqual([]);
    expect(labSamples('nope')).toEqual([]);
  });
});
