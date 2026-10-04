import type { TraceBundle } from '@cryventure/core';
import sha224Abc from './sha256-sha-224-abc.bundle.json';
import sha256Abc from './sha256-sha-256-abc.bundle.json';
import sha256ThreeBlock from './sha256-sha-256-three-block.bundle.json';
import sha256TwoBlock from './sha256-sha-256-two-block.bundle.json';
import sha512Abc from './sha512-sha-512-abc.bundle.json';
import sha512TwoBlock from './sha512-sha-512-two-block.bundle.json';

/**
 * Test-only: real `sha256` producer bundles (state + values + wordops facets, round detail) of the
 * presets "abc" (SHA-256 and SHA-224), the two-block and the 128-byte three-block message, and real
 * `sha512` bundles of SHA-512 "abc" and its two-block message, generated from `@cryventure/primitives`
 * (derivers may not import primitives, hence the JSON snapshot, as for the AES fixtures).
 */
export const SHA_FIXTURE_PRESETS = [
  'sha-256-abc',
  'sha-256-two-block',
  'sha-256-three-block',
  'sha-224-abc',
] as const;
export type ShaFixturePreset = (typeof SHA_FIXTURE_PRESETS)[number];

/** The `sha512` presets (docs/M6.md §5d). */
export const SHA512_FIXTURE_PRESETS = ['sha-512-abc', 'sha-512-two-block'] as const;
export type Sha512FixturePreset = (typeof SHA512_FIXTURE_PRESETS)[number];

const FIXTURES: Record<ShaFixturePreset | Sha512FixturePreset, { bundle: unknown }> = {
  'sha-256-abc': sha256Abc,
  'sha-256-two-block': sha256TwoBlock,
  'sha-256-three-block': sha256ThreeBlock,
  'sha-224-abc': sha224Abc,
  'sha-512-abc': sha512Abc,
  'sha-512-two-block': sha512TwoBlock,
};

/** A fresh deep copy of the preset's bundle (tests may mutate it). */
export function shaFixtureBundle(preset: ShaFixturePreset | Sha512FixturePreset): TraceBundle {
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
export function sharedShaFixtureBundle(
  preset: ShaFixturePreset | Sha512FixturePreset,
): TraceBundle {
  return deepFreeze(FIXTURES[preset].bundle) as TraceBundle;
}
