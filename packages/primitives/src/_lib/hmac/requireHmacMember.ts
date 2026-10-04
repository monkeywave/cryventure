import { i18nRef, requirePortMember, type I18nRef, type MacConstruction, type MacFunction, type PortResolver } from '@cryventure/core';

/** A `Mac` member known to be an HMAC: its `construction.hash` names the Hash member. */
export type HmacMacFunction = MacFunction & { readonly construction: Extract<MacConstruction, { kind: 'hmac' }> };

/** Whether `mac` is built as HMAC. */
function isHmac(mac: MacFunction): mac is HmacMacFunction {
  return mac.construction.kind === 'hmac';
}

/**
 * The HMAC a producer param names (hkdf, pbkdf2, tls12-prf, tls10-prf: each is defined over HMAC):
 * the `Mac` member `ref`, or a run error (`core.error.portMissing`, `portLoadFailed`,
 * `portMemberMissing`, or `<ns>.error.notHmac` with `{ id: ref }` when the member is a KMAC or a
 * keyed hash).
 */
export function requireHmacMember(resolve: PortResolver | undefined, ref: string, ns: string): { ok: true; mac: HmacMacFunction } | { ok: false; error: I18nRef } {
  const member = requirePortMember(resolve, 'Mac', ref);
  if (!member.ok) return member;
  const mac = member.member;
  if (!isHmac(mac)) return { ok: false, error: i18nRef(`${ns}.error.notHmac`, { id: ref }) };
  return { ok: true, mac };
}
