import c1 from './aes-fips197-c1.bundle.json';
import c2 from './aes-fips197-c2.bundle.json';
import c3 from './aes-fips197-c3.bundle.json';
import { fixtureLoader } from './fixtureLoader.ts';

/**
 * Test-only: real AES producer bundles (state + values facets, op detail) of the FIPS 197 App. C
 * presets, generated from `@cryventure/primitives` (derivers may not import primitives, hence the
 * JSON snapshot, as for the views fixtures). Kept fresh by tools' `snapshotFixtures.test.ts`;
 * `pnpm fixtures:update` regenerates them.
 */
export const AES_FIXTURE_PRESETS = ['fips197-c1', 'fips197-c2', 'fips197-c3'] as const;
export type AesFixturePreset = (typeof AES_FIXTURE_PRESETS)[number];

const LOADER = fixtureLoader<AesFixturePreset>({
  'fips197-c1': c1,
  'fips197-c2': c2,
  'fips197-c3': c3,
});

/** A fresh deep copy of the preset's bundle (tests may mutate it). */
export const aesFixtureBundle = LOADER.fresh;
