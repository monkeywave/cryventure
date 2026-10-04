import { i18nRef, requirePortMember, type I18nRef, type MacFunction, type PortResolver } from '@cryventure/core';

/**
 * The HMAC a TLS PRF param names: the `Mac` member `ref`, or a run error (`core.error.portMissing`,
 * `portLoadFailed`, `portMemberMissing`, or `<ns>.error.notHmac` when the member is a KMAC or a keyed
 * hash: P_hash is defined over HMAC, RFC 5246 §5).
 */
export function requireHmac(resolve: PortResolver | undefined, ref: string, ns: string): { ok: true; mac: MacFunction } | { ok: false; error: I18nRef } {
  const member = requirePortMember(resolve, 'Mac', ref);
  if (!member.ok) return member;
  if (member.member.construction.kind !== 'hmac') return { ok: false, error: i18nRef(`${ns}.error.notHmac`, { id: ref }) };
  return { ok: true, mac: member.member };
}
