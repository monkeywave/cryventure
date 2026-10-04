import { definePrimitive, type Preset, type ValidationResult } from '@cryventure/core';
import { readSha2Input, SHA256_MAX_MESSAGE_BYTES, sha2HashLabParams, sha2Ops, sha2ParamFields, sha2Preset, validateSha2Params, type Sha2Detail, type Sha2Encoding, type Sha2HashParams } from '../_lib/sha2/manifestKit.ts';
import { hashPortMembers, hmacPortMembers } from '../_lib/hmac/manifestKit.ts';

/**
 * Manifest for SHA-224 and SHA-256 (FIPS 180-4 §6.2, §6.3), traced per round or per block
 * (docs/M5.md §2b–2e). Imports core and the core-only `_lib/sha2/manifestKit.ts` only; the implementation and the
 * SHA-2 recorder in `_lib/sha2` load lazily.
 */
export const SHA256_ALGORITHM_IDS = ['sha-224', 'sha-256'] as const;
export type Sha256AlgorithmId = (typeof SHA256_ALGORITHM_IDS)[number];
export type Sha256Encoding = Sha2Encoding;
export type Sha256Detail = Sha2Detail;

export type Sha256Params = Sha2HashParams<Sha256AlgorithmId>;

const NS = 'plugin.sha256';

/** FIPS 180-4 / NIST "Examples with intermediate values": the one-block and the two-block message. */
const ABC = 'abc';
const TWO_BLOCK = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
/** Exactly 128 ASCII bytes (the input limit): two full blocks, so the padding needs a third block of its own. */
const THREE_BLOCK = 'This 128-byte message fills exactly two 64-byte blocks, so SHA-256 must add a third block purely for the padding and the length.';

function preset(id: string, algorithm: Sha256AlgorithmId, input: string, detail: Sha2Detail = 'round'): Preset<Sha256Params> {
  return sha2Preset(NS, id, algorithm, input, detail);
}

export const SHA256_PRESETS: Preset<Sha256Params>[] = [
  preset('sha-256-abc', 'sha-256', ABC),
  preset('sha-256-two-block', 'sha-256', TWO_BLOCK),
  // The same message one block per step: the Merkle–Damgård chain at a glance (hash/index lab, docs/M5.md §7).
  preset('sha-256-two-block-blocks', 'sha-256', TWO_BLOCK, 'block'),
  preset('sha-256-three-block', 'sha-256', THREE_BLOCK),
  preset('sha-224-abc', 'sha-224', ABC),
  preset('sha-256-empty', 'sha-256', ''),
];

export const SHA256_PARAM_FIELDS = sha2ParamFields(NS, SHA256_ALGORITHM_IDS, SHA256_MAX_MESSAGE_BYTES);

/** Every op the module records (`StateStep.op`): `SHA2_OP_NAMES` of `_lib/sha2/manifestKit.ts`. */
export const SHA256_OPS = sha2Ops(NS);

/** The message text: UTF-8 of at most 128 bytes, or hex of 0 … 128 bytes (normalised to lowercase). */
export function readSha256Input(input: unknown, encoding: Sha256Encoding): ValidationResult<string> {
  return readSha2Input(NS, input, encoding, SHA256_MAX_MESSAGE_BYTES);
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateSha256Params(params: unknown): ValidationResult<Sha256Params> {
  return validateSha2Params(NS, SHA256_ALGORITHM_IDS, SHA256_MAX_MESSAGE_BYTES, params);
}

export const sha256Manifest = definePrimitive<Sha256Params>({
  kind: 'primitive',
  id: 'sha256',
  apiVersion: 1,
  family: 'hash',
  implements: ['Hash', 'Mac'],
  titleKey: `${NS}.title`,
  refs: [
    'NIST FIPS 180-4 §4.1.2, §4.2.2 (functions and constants), §5.1.1 (padding), §5.3.2–5.3.3 (initial hash values)',
    'NIST FIPS 180-4 §6.2 (SHA-256), §6.3 (SHA-224)',
    'NIST CSRC, Examples with Intermediate Values: SHA256.pdf, SHA224.pdf',
    'NIST CAVP, SHAVS byte-oriented test vectors (SHA224ShortMsg.rsp, SHA256ShortMsg.rsp)',
  ],
  facets: ['state', 'values', 'narration', 'wordops'],
  presets: SHA256_PRESETS,
  defaults: { ...SHA256_PRESETS[0]!.params },
  i18nNamespace: NS,
  portMembers: { Hash: hashPortMembers(SHA256_ALGORITHM_IDS, (id) => `${NS}.param.algorithmOption.${id}`), Mac: hmacPortMembers(NS, SHA256_ALGORITHM_IDS) },
  paramFields: SHA256_PARAM_FIELDS,
  ops: SHA256_OPS,
  outputs: { digest: { labelKey: `${NS}.value.digest` } },
  validate: validateSha256Params,
  hashLabParams: sha2HashLabParams(SHA256_ALGORITHM_IDS, SHA256_MAX_MESSAGE_BYTES),
  load: () => import('./module.ts'),
});

export default sha256Manifest;
