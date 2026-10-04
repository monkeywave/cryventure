import { definePrimitive, type Preset, type ValidationResult } from '@cryventure/core';
import { readSha2Input, SHA512_MAX_MESSAGE_BYTES, sha2HashLabParams, sha2Ops, sha2ParamFields, sha2Preset, validateSha2Params, type Sha2Detail, type Sha2Encoding, type Sha2HashParams } from '../_lib/sha2/manifestKit.ts';
import { hashPortMembers, hmacPortMembers } from '../_lib/hmac/manifestKit.ts';

/**
 * Manifest for SHA-384, SHA-512, SHA-512/224 and SHA-512/256 (FIPS 180-4 §6.4–6.7) plus the
 * SHA-512/t IV generation function (§5.3.6), traced per round or per block (docs/M5.md §2b–2e).
 * Imports core and the core-only `_lib/sha2/manifestKit.ts` only; the implementation and the
 * SHA-2 recorder in `_lib/sha2` load lazily.
 */
/** The four standard hash functions (the `Hash` port offers exactly these). */
export const SHA512_HASH_IDS = ['sha-384', 'sha-512', 'sha-512/224', 'sha-512/256'] as const;
export const SHA512_ALGORITHM_IDS = [...SHA512_HASH_IDS, 'sha-512/t-iv'] as const;
export type Sha512AlgorithmId = (typeof SHA512_ALGORITHM_IDS)[number];
export type Sha512Encoding = Sha2Encoding;
export type Sha512Detail = Sha2Detail;

export type Sha512Params = Sha2HashParams<Sha512AlgorithmId>;

const NS = 'plugin.sha512';

/** FIPS 180-4 / NIST "Examples with intermediate values": the one-block and the 112-byte two-block message. */
const ABC = 'abc';
const TWO_BLOCK = 'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';

function preset(id: string, algorithm: Sha512AlgorithmId, input: string): Preset<Sha512Params> {
  return sha2Preset(NS, id, algorithm, input);
}

export const SHA512_PRESETS: Preset<Sha512Params>[] = [
  preset('sha-512-abc', 'sha-512', ABC),
  preset('sha-512-two-block', 'sha-512', TWO_BLOCK),
  preset('sha-384-abc', 'sha-384', ABC),
  preset('sha-512-224-abc', 'sha-512/224', ABC),
  preset('sha-512-256-abc', 'sha-512/256', ABC),
  // §5.3.6: the IV generation function over the ASCII text "SHA-512/t" yields the H(0) of SHA-512/t.
  preset('sha-512-256-iv', 'sha-512/t-iv', 'SHA-512/256'),
  preset('sha-512-224-iv', 'sha-512/t-iv', 'SHA-512/224'),
];

export const SHA512_PARAM_FIELDS = sha2ParamFields(NS, SHA512_ALGORITHM_IDS, SHA512_MAX_MESSAGE_BYTES);

/** Every op the module records (`StateStep.op`): `SHA2_OP_NAMES` of `_lib/sha2/manifestKit.ts`. */
export const SHA512_OPS = sha2Ops(NS);

/** The message text: UTF-8 of at most 384 bytes, or hex of 0 … 384 bytes (normalised to lowercase). */
export function readSha512Input(input: unknown, encoding: Sha512Encoding): ValidationResult<string> {
  return readSha2Input(NS, input, encoding, SHA512_MAX_MESSAGE_BYTES);
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateSha512Params(params: unknown): ValidationResult<Sha512Params> {
  return validateSha2Params(NS, SHA512_ALGORITHM_IDS, SHA512_MAX_MESSAGE_BYTES, params);
}

export const sha512Manifest = definePrimitive<Sha512Params>({
  kind: 'primitive',
  id: 'sha512',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash', 'Mac'],
  titleKey: `${NS}.title`,
  refs: [
    'NIST FIPS 180-4 §4.1.3, §4.2.3 (functions and constants), §5.1.2 (padding), §5.3.4–5.3.6 (initial hash values, SHA-512/t IV generation)',
    'NIST FIPS 180-4 §6.4 (SHA-512), §6.5 (SHA-384), §6.6 (SHA-512/224), §6.7 (SHA-512/256)',
    'NIST CSRC, Examples with Intermediate Values: SHA512.pdf, SHA384.pdf, SHA512_224.pdf, SHA512_256.pdf',
    'NIST CAVP, SHAVS byte-oriented test vectors (SHA384ShortMsg.rsp, SHA512ShortMsg.rsp, SHA512_224ShortMsg.rsp, SHA512_256ShortMsg.rsp)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: SHA512_PRESETS,
  defaults: { ...SHA512_PRESETS[0]!.params },
  i18nNamespace: NS,
  portMembers: { Hash: hashPortMembers(SHA512_HASH_IDS, (id) => `${NS}.param.algorithmOption.${id}`), Mac: hmacPortMembers(NS, SHA512_HASH_IDS) },
  paramFields: SHA512_PARAM_FIELDS,
  ops: SHA512_OPS,
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: validateSha512Params,
  hashLabParams: sha2HashLabParams(SHA512_HASH_IDS, SHA512_MAX_MESSAGE_BYTES),
  load: () => import('./module.ts'),
});

export default sha512Manifest;
