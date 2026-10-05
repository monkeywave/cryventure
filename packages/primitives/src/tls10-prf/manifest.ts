import { definePrimitive, opLabels, type Preset, type ValidationResult } from '@cryventure/core';
import { hmacMemberField } from '../_lib/hmac/manifestKit.ts';
import { prfInputFields, readMacRef, readParamsRecord, readPrfInputs, type PrfInputs } from '../_lib/prf/manifestKit.ts';

/**
 * Manifest for the TLS 1.0/1.1 PRF, P_MD5(S1, label ‖ seed) ⊕ P_SHA-1(S2, label ‖ seed) (RFC 2246
 * §5, unchanged in RFC 4346; docs/M7.md §2f). Imports core and the PRF manifest kit only.
 */
export interface Tls10PrfParams extends PrfInputs {
  /** The HMAC of the first half (RFC 2246: HMAC-MD5), a member ref. */
  md5Mac: string;
  /** The HMAC of the second half (RFC 2246: HMAC-SHA-1), a member ref. */
  sha1Mac: string;
}

const NS = 'plugin.tls10-prf';

/** CAVP SP 800-135 TLS, [TLS 1.0/1.1] COUNT=0: master secret = PRF(pre-master secret, "master secret", ClientHello.random ‖ ServerHello.random)[0..48). */
const CAVP_TLS10 = {
  preMasterSecret: 'bded7fa5c1699c010be23dd06ada3a48349f21e5f86263d512c0c5cc379f0e780ec55d9844b2f1db02a96453513568d0',
  clientHelloRandom: 'e5acaf549cd25c22d964c0d930fa4b5261d2507fad84c33715b7b9a864020693',
  serverHelloRandom: '135e4d557fdf3aa6406d82975d5c606a9734c9334b42136e96990fbd5358cdb2',
};

export const TLS10_PRF_PRESETS: Preset<Tls10PrfParams>[] = [
  {
    id: 'tls10-master-secret',
    labelKey: `${NS}.preset.tls10-master-secret`,
    params: {
      md5Mac: 'md5:hmac-md5',
      sha1Mac: 'sha1:hmac-sha-1',
      secret: CAVP_TLS10.preMasterSecret,
      label: 'master secret',
      seed: CAVP_TLS10.clientHelloRandom + CAVP_TLS10.serverHelloRandom,
      length: '48',
    },
  },
];

export const TLS10_PRF_OP_NAMES = ['split', 'seed', 'a', 'p', 'xor', 'output'] as const;

/** Validates and normalises params (hex lowercased, length without leading zeros); the MACs are resolved at run time. */
export function validateTls10PrfParams(params: unknown): ValidationResult<Tls10PrfParams> {
  const record = readParamsRecord(NS, params);
  if (!record.ok) return record;
  const md5Mac = readMacRef(NS, record.value['md5Mac'], 'md5Mac');
  if (!md5Mac.ok) return md5Mac;
  const sha1Mac = readMacRef(NS, record.value['sha1Mac'], 'sha1Mac');
  if (!sha1Mac.ok) return sha1Mac;
  const inputs = readPrfInputs(NS, record.value);
  return inputs.ok ? { ok: true, value: { md5Mac: md5Mac.value, sha1Mac: sha1Mac.value, ...inputs.value } } : inputs;
}

export const tls10PrfManifest = definePrimitive<Tls10PrfParams>({
  kind: 'primitive',
  id: 'tls10-prf',
  apiVersion: 1,
  family: 'kdf',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'RFC 2246 §5 (HMAC and the pseudorandom function)',
    'RFC 2246 §8.1 (computing the master secret)',
    'RFC 2246 §6.3 (key calculation)',
    'RFC 4346 §5 (TLS 1.1 keeps the PRF)',
    'NIST SP 800-135 Rev. 1 §4.2 (TLS key derivation functions)',
  ],
  facets: ['state', 'values', 'derivation', 'narration'],
  presets: TLS10_PRF_PRESETS,
  defaults: { ...TLS10_PRF_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: [hmacMemberField(NS, 'md5Mac'), hmacMemberField(NS, 'sha1Mac'), ...prfInputFields(NS)],
  ops: opLabels(NS, TLS10_PRF_OP_NAMES),
  outputs: { output: { labelKey: `${NS}.value.output` } },
  validate: validateTls10PrfParams,
  load: () => import('./module.ts'),
});

export default tls10PrfManifest;
