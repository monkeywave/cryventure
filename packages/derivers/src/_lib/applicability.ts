import type { TraceBundle } from '@cryventure/core';

/**
 * Applicability rules the deriver manifests share (docs/M4.md §1b). Manifests load eagerly, so this
 * module stays tiny and imports `@cryventure/core` types only.
 */

export const AES_PRODUCER_ID = 'aes';

/** True for an AES bundle at op detail: producer `aes`, run with `detail: 'op'` (its validated params). */
export function isAesOpBundle(bundle: TraceBundle): boolean {
  return bundle.producer.id === AES_PRODUCER_ID && hasOpDetail(bundle.params);
}

function hasOpDetail(params: unknown): boolean {
  return typeof params === 'object' && params !== null && (params as { detail?: unknown }).detail === 'op';
}
