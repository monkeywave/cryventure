import type { TraceBundle } from '@cryventure/core';

/**
 * SHA-512 applicability (docs/M6.md §5a), next to the SHA-256 rule in `_lib/applicability.ts`.
 * Manifests load eagerly, so this module stays tiny and imports `@cryventure/core` types only.
 */

export const SHA512_PRODUCER_ID = 'sha512';

/** True for a SHA-384/512 (and SHA-512/t, IV generation) bundle at round detail: producer `sha512`, `detail: 'round'`. */
export function isSha512RoundBundle(bundle: TraceBundle): boolean {
  const params = bundle.params as { detail?: unknown } | null | undefined;
  return bundle.producer.id === SHA512_PRODUCER_ID && params?.detail === 'round';
}
