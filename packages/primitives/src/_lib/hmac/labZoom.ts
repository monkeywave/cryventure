import { toHex, type LabZoom, type MacFunction } from '@cryventure/core';
import { HMAC_LAB_MAX_KEY_BYTES, HMAC_LAB_MAX_MESSAGE_BYTES } from './manifestKit.ts';

/**
 * Zoom links into the `hmac` lab (docs/M7.md §1d) for producers built on HMAC (hkdf, pbkdf2, the
 * TLS PRFs): one builder for the lab's params and limits, so every caller emits params the lab's
 * `validate` accepts.
 */

/** The `hmac` lab's producer id. */
export const HMAC_LAB_ID = 'hmac';

/** A zoom into the `hmac` lab computing HMAC(key, message) over the `Hash` member `hashRef` (full tag, hex message), or `undefined` past the lab's key or message limit. */
export function hmacLabZoom(hashRef: string, key: ArrayLike<number>, message: ArrayLike<number>): LabZoom | undefined {
  if (key.length > HMAC_LAB_MAX_KEY_BYTES || message.length > HMAC_LAB_MAX_MESSAGE_BYTES) return undefined;
  return { producerId: HMAC_LAB_ID, params: { hash: hashRef, key: toHex(key), encoding: 'hex', input: toHex(message), tagLength: 'full', expected: '' } };
}

/** `hmacLabZoom` for the `Mac` member `mac`: `undefined` unless it is an HMAC (its hash names the lab's `hash`). */
export function macLabZoom(mac: Pick<MacFunction, 'construction'>, key: ArrayLike<number>, message: ArrayLike<number>): LabZoom | undefined {
  return mac.construction.kind === 'hmac' ? hmacLabZoom(mac.construction.hash, key, message) : undefined;
}
