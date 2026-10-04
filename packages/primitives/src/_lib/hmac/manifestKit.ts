import type { PortMemberDecl } from '@cryventure/core';

/**
 * The `portMembers` declarations of the hash producers (docs/M7.md §1b, §2a). Manifests load
 * eagerly, so this module imports `@cryventure/core` only.
 */

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
