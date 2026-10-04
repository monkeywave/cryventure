import { describe, expect, it } from 'vitest';
import { SHA_DERIVER_CONTRACT, shaApplicability } from '../_lib/sha/fixtures/shaDeriverChecks.ts';
import { sharedShaFixtureBundle } from '../_lib/sha/fixtures/shaBundles.ts';
import manifest from './manifest.ts';

describe('isa-x86-sha manifest', () => {
  it('declares the deriver contract (docs/M5.md §5a)', () => {
    expect(manifest).toMatchObject({ ...SHA_DERIVER_CONTRACT, id: 'isa-x86-sha' });
  });

  it('applies to SHA-224/256 bundles at round detail only', () => {
    expect(shaApplicability(manifest)).toEqual([true, true, false, false]);
  });

  it('loads a module whose derive returns the x86_64-sha-ni variant of both kinds', async () => {
    const module = await manifest.load();
    expect(Object.keys(module.derive(sharedShaFixtureBundle('sha-256-abc')))).toEqual([
      'instructions@x86_64-sha-ni',
      'registers@x86_64-sha-ni',
    ]);
  });
});
