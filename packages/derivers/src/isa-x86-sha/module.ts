import type { FacetKey, TraceBundle } from '@cryventure/core';
import { deriveShaIsaFacets } from '../_lib/sha/shaDerivation.ts';
import { X86_SHA_PROFILE } from './profile.ts';

/** `instructions@x86_64-sha-ni` and `registers@x86_64-sha-ni` for a SHA-224/256 round-detail bundle; throws on a broken SHA contract. */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  return deriveShaIsaFacets(bundle, X86_SHA_PROFILE);
}
