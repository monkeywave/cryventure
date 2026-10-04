import { describe, expect, it } from 'vitest';
import { aesFixtureBundle } from '../_lib/fixtures/aesBundles.ts';
import {
  sha3FixtureBundle,
  sharedSha3FixtureBundle,
} from '../_lib/keccak/fixtures/keccakBundles.ts';
import { shaFixtureBundle } from '../_lib/sha/fixtures/shaBundles.ts';
import manifest from './manifest.ts';

describe('isa-armv8-sha3 manifest', () => {
  it('declares the deriver contract (docs/M6.md §5a)', () => {
    expect(manifest).toMatchObject({
      kind: 'deriver',
      id: 'isa-armv8-sha3',
      apiVersion: 1,
      from: ['state', 'sponge'],
      provides: ['instructions', 'registers'],
    });
  });

  it('applies to sha3 bundles at mapping detail only', () => {
    const atDetail = (detail: string) => {
      const bundle = sha3FixtureBundle('sha3-256-abc');
      bundle.params = { ...(bundle.params as object), detail };
      return bundle;
    };
    const bundles = [
      sha3FixtureBundle('sha3-256-abc'),
      sha3FixtureBundle('shake128-abc-336'),
      atDetail('round'),
      atDetail('permutation'),
      shaFixtureBundle('sha-256-abc'),
      aesFixtureBundle('fips197-c1'),
    ];
    expect(bundles.map((bundle) => manifest.appliesTo!(bundle))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('loads a module whose derive returns the aarch64-armv8-sha3 variant of both kinds', async () => {
    const module = await manifest.load();
    expect(Object.keys(module.derive(sharedSha3FixtureBundle('sha3-256-abc')))).toEqual([
      'instructions@aarch64-armv8-sha3',
      'registers@aarch64-armv8-sha3',
    ]);
  });
});
