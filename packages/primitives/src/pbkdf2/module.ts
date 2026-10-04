import { facetKey, i18nRef, narrationFromState, requirePortMember, type MacFunction, type RunOptions, type RunResult } from '@cryventure/core';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { pbkdf2Derivation, pbkdf2Values } from './facets.ts';
import { pbkdf2Manifest, type Pbkdf2Params } from './manifest.ts';
import { recordPbkdf2 } from './record.ts';

/** PBKDF2 producer (RFC 8018 §5.2): DK = T₁ ‖ … ‖ T_l, T_i = U₁ ⊕ … ⊕ U_c, PRF = the HMAC member `mac`. */
const NS = 'plugin.pbkdf2';

/** The PRF's display name, e.g. `hmac-sha-256` → `HMAC-SHA-256`. */
export function macDisplayName(mac: Pick<MacFunction, 'id'>): string {
  return mac.id.toUpperCase();
}

/** Validates `params`, resolves the HMAC member, records PBKDF2 and returns a TraceBundle (run errors: missing or non-HMAC member). */
export function run(params: Pbkdf2Params, options: RunOptions = {}): RunResult {
  const validated = pbkdf2Manifest.validate(params);
  if (!validated.ok) return validated;
  const value = validated.value;
  const resolved = requirePortMember(options.resolve, 'Mac', value.mac);
  if (!resolved.ok) return resolved;
  const mac = resolved.member;
  if (mac.construction.kind !== 'hmac') return { ok: false, error: i18nRef(`${NS}.error.notHmac`, { id: value.mac }) };
  const password = hashMessageBytes(value.passwordEncoding, value.password);
  const salt = hashMessageBytes(value.saltEncoding, value.salt);
  const iterations = Number(value.iterations);
  const length = Number(value.length);
  const recording = recordPbkdf2({ macName: macDisplayName(mac), outputSize: mac.outputSize, keyed: mac.create(Uint8Array.from(password)), password, salt, iterations, length });
  return {
    ok: true,
    trace: {
      schemaVersion: 1,
      producer: { kind: 'primitive', id: pbkdf2Manifest.id, apiVersion: pbkdf2Manifest.apiVersion },
      provenance: 'modeled',
      params: value,
      facets: {
        [facetKey('state')]: recording.state,
        [facetKey('values')]: pbkdf2Values(recording, password, salt),
        [facetKey('derivation')]: pbkdf2Derivation(recording, { hashRef: mac.construction.hash, password, salt }),
        [facetKey('narration')]: narrationFromState(recording.state),
      },
      output: { dk: recording.dk },
    },
  };
}
