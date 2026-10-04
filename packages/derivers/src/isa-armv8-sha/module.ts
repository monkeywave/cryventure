import type { FacetKey, TraceBundle } from '@cryventure/core';
import { SHA512_PRODUCER_ID } from '../_lib/sha/manifestKit.ts';
import { deriveShaIsaFacets } from '../_lib/sha/shaDerivation.ts';
import { ARMV8_SHA_PROFILE } from './profile.ts';
import { ARMV8_SHA512_PROFILE } from './sha512Profile.ts';

/**
 * `instructions@aarch64-armv8-sha2` and `registers@aarch64-armv8-sha2` for a SHA-224/256 round-detail
 * bundle, `…@aarch64-armv8-sha512` for a SHA-512-family one; throws on a broken SHA contract.
 */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  const profile =
    bundle.producer.id === SHA512_PRODUCER_ID ? ARMV8_SHA512_PROFILE : ARMV8_SHA_PROFILE;
  return deriveShaIsaFacets(bundle, profile);
}
