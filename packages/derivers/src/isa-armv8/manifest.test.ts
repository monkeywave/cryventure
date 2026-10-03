import { describe, expect, it } from 'vitest';
import { aesFixtureBundle } from '../_lib/fixtures/aesBundles.ts';
import manifest from './manifest.ts';

describe('isa-armv8 manifest', () => {
  it('declares the deriver contract', () => {
    expect(manifest).toMatchObject({
      kind: 'deriver',
      id: 'isa-armv8',
      apiVersion: 1,
      from: ['state', 'values'],
      provides: ['instructions', 'registers'],
    });
  });

  it('applies to AES op-detail bundles only', () => {
    const merged = aesFixtureBundle('fips197-c1');
    merged.params = { ...(merged.params as object), detail: 'round' };
    const bundles = [
      aesFixtureBundle('fips197-c1'),
      merged,
      {
        ...aesFixtureBundle('fips197-c2'),
        producer: { kind: 'primitive' as const, id: 'xor', apiVersion: 1 },
      },
      { ...aesFixtureBundle('fips197-c3'), params: {} },
    ];
    expect(bundles.map((bundle) => manifest.appliesTo!(bundle))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it('loads a module whose derive returns both variants', async () => {
    const module = await manifest.load();
    expect(Object.keys(module.derive(aesFixtureBundle('fips197-c1')))).toEqual([
      'instructions@aarch64-armv8-ce',
      'registers@aarch64-armv8-ce',
    ]);
  });
});
