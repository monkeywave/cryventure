import type { PortMemberDecl } from '@cryventure/core';

/**
 * The `portMembers` declarations of the hash producers (docs/M7.md §1b, §2a). Manifests load
 * eagerly, so this module imports `@cryventure/core` only.
 */

/** The `hmac` lab's key limit in bytes (docs/M7.md §2b; RFC 4231 test 7 has a 131-byte key). */
export const HMAC_LAB_MAX_KEY_BYTES = 256;
/** The `hmac` lab's message limit in bytes (RFC 4231 test 7 has a 152-byte message). */
export const HMAC_LAB_MAX_MESSAGE_BYTES = 256;

/**
 * The longest hash input an `hmac` lab run feeds a hash of block size B: the inner call
 * (K0 ⊕ ipad) ‖ m, B + 256 bytes. The outer call (B + L) and the key hash (≤ 256 bytes) are
 * shorter, so a hash lab taking this many bytes receives every zoom of the HMAC lab (docs/M7.md §1d).
 */
export function hmacHashInputMaxBytes(blockBytes: number): number {
  return blockBytes + HMAC_LAB_MAX_MESSAGE_BYTES;
}

/** The Mac member id of HMAC over the Hash member `functionId`, e.g. `hmac-sha-256`. */
export function hmacMemberId(functionId: string): string {
  return `hmac-${functionId}`;
}

/** The Mac member declarations `hmac-<functionId>`, labelled `<namespace>.mac.hmac-<functionId>`. */
export function hmacPortMembers(namespace: string, functionIds: readonly string[]): PortMemberDecl[] {
  return functionIds.map((functionId) => {
    const id = hmacMemberId(functionId);
    return { id, labelKey: `${namespace}.mac.${id}`, construction: 'hmac' };
  });
}

/**
 * The Hash member declarations of `functionIds`, labelled by `labelKey(functionId)`, e.g. the
 * existing select option `` (id) => `${ns}.param.algorithmOption.${id}` ``.
 */
export function hashPortMembers(functionIds: readonly string[], labelKey: (functionId: string) => string): PortMemberDecl[] {
  return functionIds.map((id) => ({ id, labelKey: labelKey(id) }));
}
