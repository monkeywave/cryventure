import type { FacetKey, TraceBundle } from '@cryventure/core';
import { deriveKeccakIsaFacets } from '../_lib/keccak/keccakDerivation.ts';
import { ARMV8_SHA3_PROFILE } from './profile.ts';

/** `instructions@aarch64-armv8-sha3` and `registers@aarch64-armv8-sha3` for a `sha3` mapping-detail bundle; throws on a broken sponge contract. */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  return deriveKeccakIsaFacets(bundle, ARMV8_SHA3_PROFILE);
}
