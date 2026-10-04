import type { TraceBundle } from '@cryventure/core';
import sha224Abc from './sha256-sha-224-abc.bundle.json';
import sha256Abc from './sha256-sha-256-abc.bundle.json';
import sha256ThreeBlock from './sha256-sha-256-three-block.bundle.json';
import sha256TwoBlock from './sha256-sha-256-two-block.bundle.json';

/**
 * Test-only: real `sha256` producer bundles (state + values + wordops facets, round detail) of the
 * presets "abc" (SHA-256 and SHA-224), the two-block and the 128-byte three-block message, generated
 * from `@cryventure/primitives` (derivers may not import primitives, hence the JSON snapshot, as for
 * the AES fixtures).
 */
export const SHA_FIXTURE_PRESETS = [
  'sha-256-abc',
  'sha-256-two-block',
  'sha-256-three-block',
  'sha-224-abc',
] as const;
export type ShaFixturePreset = (typeof SHA_FIXTURE_PRESETS)[number];

const FIXTURES: Record<ShaFixturePreset, { bundle: unknown }> = {
  'sha-256-abc': sha256Abc,
  'sha-256-two-block': sha256TwoBlock,
  'sha-256-three-block': sha256ThreeBlock,
  'sha-224-abc': sha224Abc,
};

/** A fresh deep copy of the preset's bundle (tests may mutate it). */
export function shaFixtureBundle(preset: ShaFixturePreset): TraceBundle {
  return JSON.parse(JSON.stringify(FIXTURES[preset].bundle)) as TraceBundle;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/**
 * The preset's bundle itself, deep-frozen, for tests that only read it: no copy per call, and the
 * per-bundle trace caches hit across tests. Use `shaFixtureBundle` to tamper with a bundle.
 */
export function sharedShaFixtureBundle(preset: ShaFixturePreset): TraceBundle {
  return deepFreeze(FIXTURES[preset].bundle) as TraceBundle;
}
