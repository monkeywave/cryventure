import type { MacContext, MacFunction } from '@cryventure/core';

/** Small helpers the HMAC-based KDFs share (hkdf, pbkdf2, the TLS PRFs). Core's `blockCount` gives ⌈length / HashLen⌉. */

/** The display name of a `Mac` member, e.g. `hmac-sha-256` → `HMAC-SHA-256`. */
export function macDisplayName(mac: Pick<MacFunction, 'id'>): string {
  return mac.id.toUpperCase();
}

/**
 * MAC(K, data) from a context already keyed with K: a clone absorbs `data`, the keyed context stays
 * untouched, so K is keyed once (for HMAC: the inner and outer midstates are computed once).
 */
export function keyedMac(keyed: MacContext, data: Uint8Array): Uint8Array {
  const context = keyed.clone();
  context.update(data);
  return context.mac();
}
