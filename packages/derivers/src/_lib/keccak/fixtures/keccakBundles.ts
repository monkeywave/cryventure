import type { TraceBundle } from '@cryventure/core';
import sha3256_1600 from './sha3-256-1600.bundle.json';
import sha3256Abc from './sha3-256-abc.bundle.json';
import sha3256Empty from './sha3-256-empty.bundle.json';
import shake128Abc336 from './shake128-abc-336.bundle.json';

/**
 * Test-only: real `sha3` producer bundles (state + values + sponge facets, mapping detail) of SHA3-256
 * "abc", NIST Msg0 (the empty message), the two-block 1600-bit message and SHAKE128 "abc" with 336
 * output bytes (two squeezes), generated from `@cryventure/primitives` (derivers may not import
 * primitives, hence the JSON snapshot). Kept fresh by tools' `snapshotFixtures.test.ts`.
 */
export const SHA3_FIXTURE_PRESETS = [
  'sha3-256-abc',
  'sha3-256-empty',
  'sha3-256-1600',
  'shake128-abc-336',
] as const;
export type Sha3FixturePreset = (typeof SHA3_FIXTURE_PRESETS)[number];

const FIXTURES: Record<Sha3FixturePreset, { bundle: unknown }> = {
  'sha3-256-abc': sha3256Abc,
  'sha3-256-empty': sha3256Empty,
  'sha3-256-1600': sha3256_1600,
  'shake128-abc-336': shake128Abc336,
};

/** A fresh deep copy of the preset's bundle (tests may mutate it). */
export function sha3FixtureBundle(preset: Sha3FixturePreset): TraceBundle {
  return JSON.parse(JSON.stringify(FIXTURES[preset].bundle)) as TraceBundle;
}

/** The preset's bundle itself, for tests that only read it (no copy; the per-bundle trace cache hits). */
export function sharedSha3FixtureBundle(preset: Sha3FixturePreset): TraceBundle {
  return FIXTURES[preset].bundle as TraceBundle;
}
