import { definePrimitive, opLabels, type Preset, type ValidationResult } from '@cryventure/core';
import { hmacMemberField, prfInputFields, readMacRef, readParamsRecord, readPrfInputs, type PrfInputs } from '../_lib/prf/manifestKit.ts';

/** Manifest for the TLS 1.2 PRF, P_<hash>(secret, label ‖ seed) (RFC 5246 §5; docs/M7.md §2f). Imports core and the PRF manifest kit only. */
export interface Tls12PrfParams extends PrfInputs {
  /** The HMAC member ref, e.g. `sha256:hmac-sha-256`. */
  mac: string;
}

const NS = 'plugin.tls12-prf';

/** CAVP SP 800-135 TLS, [TLS 1.2, SHA-256] COUNT=0 (vectors/conformance.json). */
const CAVP_SHA256 = {
  preMasterSecret: 'f8938ecc9edebc5030c0c6a441e213cd24e6f770a50dda07876f8d55da062bcadb386b411fd4fe4313a604fce6c17fbc',
  clientHelloRandom: '36c129d01a3200894b9179faac589d9835d58775f9b5ea3587cb8fd0364cae8c',
  serverHelloRandom: 'f6c9575ed7ddd73e1f7d16eca115415812a43c2b747daaaae043abfb50053fce',
  clientRandom: '62e1fd91f23f558a605f28478c58cf72637b89784d959df7e946d3f07bd1b616',
  serverRandom: 'ae6c806f8ad4d80784549dff28a4b58fd837681a51d928c3e30ee5ff14f39868',
  masterSecret: '202c88c00f84a17a20027079604787461176455539e705be730890602c289a5001e34eeb3a043e5d52a65e66125188bf',
};

/** CAVP SP 800-135 TLS, [TLS 1.2, SHA-384] COUNT=0. */
const CAVP_SHA384 = {
  preMasterSecret: 'a5e2642633f5b8c81ad3fe0c2fe3a8e5ef806b06121dd10df4bb0fe857bfdcf522558e05d2682c9a80c741a3aab1716f',
  clientHelloRandom: 'abe4bf5527429ac8eb13574d2709e8012bd1a113c6d3b1d3aa2c3840518778ac',
  serverHelloRandom: 'cb6e0b3eb02976b6466dfa9651c2919414f1648fd3a7838d02153e5bd39535b6',
};

/** A documented stand-in for the RFC 7627 session hash: SHA-256 of the empty string (no real transcript). */
const EXAMPLE_SESSION_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const HMAC_SHA256 = 'sha256:hmac-sha-256';
const MASTER_SECRET_LENGTH = '48';

const preset = (id: string, params: Tls12PrfParams): Preset<Tls12PrfParams> => ({ id, labelKey: `${NS}.preset.${id}`, params });

export const TLS12_PRF_PRESETS: Preset<Tls12PrfParams>[] = [
  preset('tls12-master-secret', {
    mac: HMAC_SHA256,
    secret: CAVP_SHA256.preMasterSecret,
    label: 'master secret',
    seed: CAVP_SHA256.clientHelloRandom + CAVP_SHA256.serverHelloRandom,
    length: MASTER_SECRET_LENGTH,
  }),
  // The key block of CAVP's 1024-bit case; RFC 5246 §6.3 swaps the randoms (server first).
  preset('tls12-key-expansion', {
    mac: HMAC_SHA256,
    secret: CAVP_SHA256.masterSecret,
    label: 'key expansion',
    seed: CAVP_SHA256.serverRandom + CAVP_SHA256.clientRandom,
    length: '128',
  }),
  preset('tls12-ems', { mac: HMAC_SHA256, secret: CAVP_SHA256.preMasterSecret, label: 'extended master secret', seed: EXAMPLE_SESSION_HASH, length: MASTER_SECRET_LENGTH }),
  preset('tls12-sha384', {
    mac: 'sha512:hmac-sha-384',
    secret: CAVP_SHA384.preMasterSecret,
    label: 'master secret',
    seed: CAVP_SHA384.clientHelloRandom + CAVP_SHA384.serverHelloRandom,
    length: MASTER_SECRET_LENGTH,
  }),
];

export const TLS12_PRF_OP_NAMES = ['seed', 'a', 'p', 'output'] as const;

/** Validates and normalises params (hex lowercased, length without leading zeros); the MAC is resolved at run time. */
export function validateTls12PrfParams(params: unknown): ValidationResult<Tls12PrfParams> {
  const record = readParamsRecord(NS, params);
  if (!record.ok) return record;
  const mac = readMacRef(NS, record.value['mac'], 'mac');
  if (!mac.ok) return mac;
  const inputs = readPrfInputs(NS, record.value);
  return inputs.ok ? { ok: true, value: { mac: mac.value, ...inputs.value } } : inputs;
}

export const tls12PrfManifest = definePrimitive<Tls12PrfParams>({
  kind: 'primitive',
  id: 'tls12-prf',
  apiVersion: 1,
  family: 'kdf',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'RFC 5246 §5 (HMAC and the pseudorandom function)',
    'RFC 5246 §8.1 (computing the master secret)',
    'RFC 5246 §6.3 (key calculation)',
    'RFC 7627 §4 (the extended master secret)',
    'RFC 5289 §3 (the SHA-384 PRF of the *_SHA384 cipher suites)',
    'NIST SP 800-135 Rev. 1 §4.2 (TLS key derivation functions)',
  ],
  facets: ['state', 'values', 'derivation', 'narration'],
  presets: TLS12_PRF_PRESETS,
  defaults: { ...TLS12_PRF_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: [hmacMemberField(NS, 'mac'), ...prfInputFields(NS)],
  ops: opLabels(NS, TLS12_PRF_OP_NAMES),
  outputs: { output: { labelKey: `${NS}.value.output` } },
  validate: validateTls12PrfParams,
  load: () => import('./module.ts'),
});

export default tls12PrfManifest;
