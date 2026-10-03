import { getFacet, type AnyStateFacet, type TraceBundle } from '@cryventure/core';

/**
 * Applicability rules the deriver manifests share (docs/M4.md §1b). Manifests load eagerly, so this
 * module stays tiny and imports `@cryventure/core` only.
 */

export const AES_PRODUCER_ID = 'aes';

/** True for an AES bundle at op detail: producer `aes`, a state facet, no merged `round` steps. */
export function isAesOpBundle(bundle: TraceBundle): boolean {
  if (bundle.producer.id !== AES_PRODUCER_ID) return false;
  const state = getFacet<AnyStateFacet>(bundle, 'state');
  return state !== undefined && !state.steps.some((step) => step.op === 'round');
}
