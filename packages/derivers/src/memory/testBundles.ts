import type { TraceBundle } from '@cryventure/core';
import { aesFixtureBundle } from '../_lib/fixtures/aesBundles.ts';

/**
 * Test-only: real AES bundles (state + values facets) of the FIPS 197 App. C presets at op detail,
 * the shared `_lib/fixtures` snapshots from `@cryventure/primitives` (derivers may not import primitives).
 */
export const AES_BUNDLES: readonly { presetId: string; keyBits: number; rounds: number; bundle: TraceBundle }[] = [
  { presetId: 'fips197-c1', keyBits: 128, rounds: 10, bundle: aesFixtureBundle('fips197-c1') },
  { presetId: 'fips197-c2', keyBits: 192, rounds: 12, bundle: aesFixtureBundle('fips197-c2') },
  { presetId: 'fips197-c3', keyBits: 256, rounds: 14, bundle: aesFixtureBundle('fips197-c3') },
];

/** The FIPS 197 C.1 (AES-128) bundle. */
export function aes128Bundle(): TraceBundle {
  return aesFixtureBundle('fips197-c1');
}
