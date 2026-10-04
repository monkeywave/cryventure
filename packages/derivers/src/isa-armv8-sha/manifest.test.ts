import { describe, expect, it } from 'vitest';
import { SHA_DERIVER_CONTRACT, shaApplicability } from '../_lib/sha/fixtures/shaDeriverChecks.ts';
import { shaFixtureBundle, sharedShaFixtureBundle } from '../_lib/sha/fixtures/shaBundles.ts';
import manifest from './manifest.ts';

describe('isa-armv8-sha manifest', () => {
  it('declares the deriver contract (docs/M5.md §5a)', () => {
    expect(manifest).toMatchObject({ ...SHA_DERIVER_CONTRACT, id: 'isa-armv8-sha' });
  });

  it('applies to SHA-224/256 bundles at round detail only', () => {
    expect(shaApplicability(manifest)).toEqual([true, true, false, false]);
  });

  it('applies to SHA-512-family bundles at round detail too (docs/M6.md §5a)', () => {
    const block = shaFixtureBundle('sha-512-abc');
    block.params = { ...(block.params as object), detail: 'block' };
    expect(manifest.appliesTo!(sharedShaFixtureBundle('sha-512-abc'))).toBe(true);
    expect(manifest.appliesTo!(sharedShaFixtureBundle('sha-512-two-block'))).toBe(true);
    expect(manifest.appliesTo!(block)).toBe(false);
  });

  it('loads a module whose derive returns the aarch64-armv8-sha2 variant of both kinds', async () => {
    const module = await manifest.load();
    expect(Object.keys(module.derive(sharedShaFixtureBundle('sha-256-abc')))).toEqual([
      'instructions@aarch64-armv8-sha2',
      'registers@aarch64-armv8-sha2',
    ]);
    expect(Object.keys(module.derive(sharedShaFixtureBundle('sha-512-abc')))).toEqual([
      'instructions@aarch64-armv8-sha512',
      'registers@aarch64-armv8-sha512',
    ]);
  });
});
