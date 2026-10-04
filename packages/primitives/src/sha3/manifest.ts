import { definePrimitive, type Preset } from '@cryventure/core';
import { sha3HashLabParams, sha3Ops, sha3ParamFields, validateSha3Params, type KeccakAlgorithmId, type Sha3Detail, type Sha3Encoding, type Sha3OutputLength, type Sha3Params } from '../_lib/keccak/manifestKit.ts';

/**
 * Manifest for SHA-3 and its relatives on Keccak-f[1600] (FIPS 202, SP 800-185 cSHAKE, the original
 * Keccak-256), traced per step mapping, per round or per permutation (docs/M6.md §2b). Imports core
 * and the core-only `_lib/keccak/manifestKit.ts` only; the sponge and the recorder load lazily.
 */
export type { Sha3Params } from '../_lib/keccak/manifestKit.ts';

const NS = 'plugin.sha3';

/** The NIST 1600-bit example message: 200 bytes a3 (two SHA3-256 rate blocks). */
const A3_1600 = 'a3'.repeat(200);

interface PresetOptions {
  encoding?: Sha3Encoding;
  outputLength?: Sha3OutputLength;
  customization?: string;
  detail?: Sha3Detail;
}

function preset(id: string, algorithm: KeccakAlgorithmId, input: string, options: PresetOptions = {}): Preset<Sha3Params> {
  const { encoding = 'utf8', outputLength = '32', customization = '', detail = 'mapping' } = options;
  return { id, labelKey: `${NS}.preset.${id}`, params: { algorithm, encoding, input, outputLength, functionName: '', customization, detail } };
}

export const SHA3_PRESETS: Preset<Sha3Params>[] = [
  preset('sha3-256-abc', 'sha3-256', 'abc'),
  preset('sha3-224-abc', 'sha3-224', 'abc'),
  preset('sha3-384-abc', 'sha3-384', 'abc'),
  preset('sha3-512-abc', 'sha3-512', 'abc'),
  preset('sha3-256-empty', 'sha3-256', ''),
  preset('sha3-256-1600', 'sha3-256', A3_1600, { encoding: 'hex' }),
  // One step per permutation: the sponge at a glance (hash/sponge lab, docs/M6.md §7).
  preset('sha3-256-abc-permutation', 'sha3-256', 'abc', { detail: 'permutation' }),
  preset('shake128-abc-336', 'shake128', 'abc', { outputLength: '336' }),
  preset('shake256-empty', 'shake256', ''),
  // SP 800-185 cSHAKE sample #1: data 00 01 02 03, N = "", S = "Email Signature", 256 output bits.
  preset('cshake128-sample1', 'cshake128', '00010203', { encoding: 'hex', customization: 'Email Signature' }),
  preset('keccak-256-abc', 'keccak-256', 'abc'),
];

export const sha3Manifest = definePrimitive<Sha3Params>({
  kind: 'primitive',
  id: 'sha3',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash'],
  titleKey: `${NS}.title`,
  refs: [
    'NIST FIPS 202 §3 (Keccak-p permutations: θ, ρ, π, χ, ι), §4 (sponge construction), §5 (pad10*1), §6 (SHA-3 and SHAKE), Appendix B (byte order)',
    'NIST SP 800-185 §2.3 (left_encode, encode_string, bytepad), §3 (cSHAKE)',
    'NIST CSRC, Examples with Intermediate Values: SHA3-256_Msg0.pdf, SHA3-*_1600.pdf, SHAKE*_Msg*.pdf, cSHAKE_samples.pdf',
    'NIST CAVP, SHA-3 byte-oriented test vectors (SHA3_*ShortMsg.rsp, SHAKE*ShortMsg.rsp, SHAKE*VariableOut.rsp)',
    'G. Bertoni, J. Daemen, M. Peeters, G. Van Assche: The Keccak reference, version 3.0 (2011): the original Keccak padding used by Keccak-256',
  ],
  facets: ['state', 'values', 'narration', 'sponge'],
  presets: SHA3_PRESETS,
  defaults: { ...SHA3_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: sha3ParamFields(NS),
  ops: sha3Ops(NS),
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: (params) => validateSha3Params(NS, params),
  hashLabParams: sha3HashLabParams,
  load: () => import('./module.ts'),
});

export default sha3Manifest;
