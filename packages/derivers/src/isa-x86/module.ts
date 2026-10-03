import type { FacetKey, TraceBundle } from '@cryventure/core';
import { deriveIsaFacets } from '../_lib/isaDerivation.ts';
import { X86_PROFILE } from './profile.ts';

/** `instructions@x86_64-aesni` and `registers@x86_64-aesni` for an AES op-detail bundle; throws on a broken AES contract. */
export function derive(bundle: TraceBundle): Partial<Record<FacetKey, unknown>> {
  return deriveIsaFacets(bundle, X86_PROFILE);
}
