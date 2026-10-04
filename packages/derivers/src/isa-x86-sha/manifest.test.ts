import { describe, expect, it } from 'vitest';
import { aesFixtureBundle } from '../_lib/fixtures/aesBundles.ts';
import { shaFixtureBundle } from '../_lib/sha/fixtures/shaBundles.ts';
import manifest from './manifest.ts';

describe('isa-x86-sha manifest', () => {
  it('declares the deriver contract (docs/M5.md §5a)', () => {
    expect(manifest).toMatchObject({
      kind: 'deriver',
      id: 'isa-x86-sha',
      apiVersion: 1,
      from: ['state', 'values', 'wordops'],
      provides: ['instructions', 'registers'],
    });
  });

  it('applies to SHA-224/256 bundles at round detail only', () => {
    const block = shaFixtureBundle('sha-256-abc');
    block.params = { ...(block.params as object), detail: 'block' };
    const bundles = [
      shaFixtureBundle('sha-256-abc'),
      shaFixtureBundle('sha-224-abc'),
      block,
      aesFixtureBundle('fips197-c1'),
    ];
    expect(bundles.map((bundle) => manifest.appliesTo!(bundle))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('loads a module whose derive returns the x86_64-sha-ni variant of both kinds', async () => {
    const module = await manifest.load();
    expect(Object.keys(module.derive(shaFixtureBundle('sha-256-abc')))).toEqual([
      'instructions@x86_64-sha-ni',
      'registers@x86_64-sha-ni',
    ]);
  });
});
