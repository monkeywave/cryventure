import type { TraceBundle } from '@cryventure/core';

/**
 * Applicability rules the deriver manifests share (docs/M4.md §1b, docs/M5.md §5a). Manifests load
 * eagerly, so this module stays tiny and imports `@cryventure/core` types only.
 */

export const AES_PRODUCER_ID = 'aes';
export const SHA256_PRODUCER_ID = 'sha256';

/** True for an AES bundle at op detail: producer `aes`, run with `detail: 'op'` (its validated params). */
export function isAesOpBundle(bundle: TraceBundle): boolean {
  return bundle.producer.id === AES_PRODUCER_ID && hasDetail(bundle.params, 'op');
}

/** True for a SHA-224/256 bundle at round detail: producer `sha256`, run with `detail: 'round'`. */
export function isSha256RoundBundle(bundle: TraceBundle): boolean {
  return bundle.producer.id === SHA256_PRODUCER_ID && hasDetail(bundle.params, 'round');
}

function hasDetail(params: unknown, detail: string): boolean {
  return (
    typeof params === 'object' &&
    params !== null &&
    (params as { detail?: unknown }).detail === detail
  );
}
