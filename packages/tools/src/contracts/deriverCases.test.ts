import type { PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { describe, expect, it } from 'vitest';
import { cachedPrimitiveBundleCases, DEFAULTS_PRESET_ID, primitiveBundleCases } from './deriverCases.ts';
import { producerRegistry, type ProducerSet } from './runWithPorts.ts';

const set = (ids: string[]): ProducerSet => {
  const list = primitiveManifests.filter((manifest) => ids.includes(manifest.id));
  return { list, lookup: producerRegistry(list) };
};

describe('primitiveBundleCases', () => {
  it('runs defaults and every preset of every producer, ports resolved', async () => {
    const producers = set(['aes', 'ecb']);
    const cases = await primitiveBundleCases(producers);
    const expected = producers.list.flatMap((manifest) => [DEFAULTS_PRESET_ID, ...manifest.presets.map((preset) => preset.id)].map((presetId) => `${manifest.id}/${presetId}`));
    expect(cases.map(({ name }) => name)).toEqual(expected);
    cases.forEach(({ producerId, bundle }) => expect(bundle.producer.id).toBe(producerId));
  });

  it('rejects a producer whose run fails', async () => {
    const aes = primitiveManifests.find((manifest) => manifest.id === 'aes')!;
    const failing = { ...aes, id: 'failing', presets: [], load: async () => ({ run: () => ({ ok: false as const, error: { key: 'bad' } }) }) } as PrimitiveManifest;
    await expect(primitiveBundleCases({ list: [failing], lookup: producerRegistry([failing]) })).rejects.toThrow('failing/defaults: run() rejected params: {"key":"bad"}');
  });
});

describe('cachedPrimitiveBundleCases', () => {
  it('runs once per producer set', () => {
    const producers = set(['xor']);
    expect(cachedPrimitiveBundleCases(producers)).toBe(cachedPrimitiveBundleCases(producers));
    expect(cachedPrimitiveBundleCases(set(['xor']))).not.toBe(cachedPrimitiveBundleCases(producers));
  });
});
