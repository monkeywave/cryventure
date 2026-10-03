import { describe, expect, it } from 'vitest';
import type { DeriverManifest, TraceBundle } from '@cryventure/core';
import { producerRegistry } from './registry.ts';
import { deriversApplicableToAny, sampleApplicableDerivers, sampleBundles } from './sampleDerivers.ts';

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
