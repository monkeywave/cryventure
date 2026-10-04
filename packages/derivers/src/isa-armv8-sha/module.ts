import type { FacetKey, TraceBundle } from '@cryventure/core';
import { deriveShaIsaFacets } from '../_lib/sha/shaDerivation.ts';
import { ARMV8_SHA_PROFILE } from './profile.ts';

/** `instructions@aarch64-armv8-sha2` and `registers@aarch64-armv8-sha2` for a SHA-224/256 round-detail bundle; throws on a broken SHA contract. */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  return deriveShaIsaFacets(bundle, ARMV8_SHA_PROFILE);
}
