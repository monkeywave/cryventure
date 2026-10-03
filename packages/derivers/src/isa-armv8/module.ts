import type { FacetKey, TraceBundle } from '@cryventure/core';
import { deriveIsaFacets } from '../_lib/isaDerivation.ts';
import { ARMV8_PROFILE } from './profile.ts';

/** `instructions@aarch64-armv8-ce` and `registers@aarch64-armv8-ce` for an AES op-detail bundle; throws on a broken AES contract. */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  return deriveIsaFacets(bundle, ARMV8_PROFILE);
}
