import type { TraceBundle } from '@cryventure/core';

/**
 * Applicability rules the deriver manifests share (docs/M4.md §1b, docs/M5.md §5a, docs/M6.md §5a). Manifests load
 * eagerly, so this module stays tiny and imports `@cryventure/core` types only.
 */

export const AES_PRODUCER_ID = 'aes';
export const SHA256_PRODUCER_ID = 'sha256';
export const SHA512_PRODUCER_ID = 'sha512';
const SHA3_PRODUCER_ID = 'sha3';

/** True for an AES bundle at op detail: producer `aes`, run with `detail: 'op'` (its validated params). */
export function isAesOpBundle(bundle: TraceBundle): boolean {
  return bundle.producer.id === AES_PRODUCER_ID && hasDetail(bundle.params, 'op');
}

/** True for a SHA-224/256 bundle at round detail: producer `sha256`, run with `detail: 'round'`. */
export function isSha256RoundBundle(bundle: TraceBundle): boolean {
  return bundle.producer.id === SHA256_PRODUCER_ID && hasDetail(bundle.params, 'round');
}

/** True for a SHA-384/512 (and SHA-512/t, IV generation) bundle at round detail: producer `sha512`, `detail: 'round'`. */
export function isSha512RoundBundle(bundle: TraceBundle): boolean {
  return bundle.producer.id === SHA512_PRODUCER_ID && hasDetail(bundle.params, 'round');
}

/** True for a Keccak bundle at mapping detail: producer `sha3` (all nine functions), run with `detail: 'mapping'` (docs/M6.md §5a). */
export function isSha3MappingBundle(bundle: TraceBundle): boolean {
  return bundle.producer.id === SHA3_PRODUCER_ID && hasDetail(bundle.params, 'mapping');
}

function hasDetail(params: unknown, detail: string): boolean {
  return (
    typeof params === 'object' &&
    params !== null &&
    (params as { detail?: unknown }).detail === detail
  );
}
