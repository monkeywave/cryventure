import { definePrimitive, opLabels, parseHexOfLength, readOption, readPortMemberRef, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';
import { HASH_ENCODINGS, messageField, messageLengths, paramError, readMessageInput, selectField, type HashEncoding } from '../_lib/hashKit/manifestKit.ts';

/**
 * Manifest for the traced HMAC lab over any `Hash` member (RFC 2104, FIPS 198-1; docs/M7.md §2b):
 * K0, the ipad and opad keys, both midstates, truncation and a constant-time verify step. Imports
 * core and the core-only hash manifest kit; the recorder loads lazily.
 */

/** `full` = the hash's output length L; the others are tag lengths t in bytes. */
export const HMAC_TAG_LENGTHS = ['full', '32', '28', '24', '20', '16', '12', '10'] as const;
export type HmacTagLength = (typeof HMAC_TAG_LENGTHS)[number];

export type HmacEncoding = HashEncoding;

export interface HmacParams {
  /** Member ref of a `Hash` function, e.g. `sha256:sha-256`. */
  hash: string;
  /** K as hex (lowercase, no separators), 0 … 256 bytes. */
  key: string;
  encoding: HmacEncoding;
  /** The message: UTF-8 text, or hex (normalised) while `encoding` is `hex`. */
  input: string;
  tagLength: HmacTagLength;
  /** The tag to verify as hex; empty = compute only. */
  expected: string;
}

/** Byte limits (docs/M7.md §2b): RFC 4231 test 7 has a 131-byte key and a 152-byte message. */
export const HMAC_MAX_KEY_BYTES = 256;
export const HMAC_MAX_MESSAGE_BYTES = 256;
/** The longest tag any `Hash` member produces (SHA-512, SHA3-512, BLAKE2b-512). */
export const HMAC_MAX_TAG_BYTES = 64;

const NS = 'plugin.hmac';

/** RFC 4231 §4 test cases (the RFC 2202 TC1 keys and data are the same 0x0b key and "Hi There"). */
const KEY_0B_20 = '0b'.repeat(20);
const HI_THERE = 'Hi There';
const RFC4231_TC1_TAG = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
/** The TC1 tag with its last byte changed (f7 → f6): verification must fail. */
const RFC4231_TC1_TAG_LAST_BYTE_WRONG = `${RFC4231_TC1_TAG.slice(0, -2)}f6`;
/** Wycheproof `hmac_sha3_256_test.json` tcId 20 (valid; 32-byte key and message). */
const WYCHEPROOF_SHA3_256_KEY = '186e248ad824e1eb93329a7fdcd565b6cb4eaf3f85b90b910777128d8c538d27';
const WYCHEPROOF_SHA3_256_MESSAGE = '92ef9ff52f46eccc7e38b9ee19fd2de3b37726c8e6ce9e1b96db5dda4c317902';

const BASE: HmacParams = { hash: 'sha256:sha-256', key: KEY_0B_20, encoding: 'utf8', input: HI_THERE, tagLength: 'full', expected: '' };

const preset = (id: string, params: Partial<HmacParams> = {}): Preset<HmacParams> => ({ id, labelKey: `${NS}.preset.${id}`, params: { ...BASE, ...params } });

export const HMAC_PRESETS: Preset<HmacParams>[] = [
  preset('rfc4231-tc1'),
  preset('rfc4231-tc2', { key: '4a656665', input: 'what do ya want for nothing?' }),
  preset('rfc4231-tc5-trunc', { key: '0c'.repeat(20), input: 'Test With Truncation', tagLength: '16' }),
  preset('rfc4231-tc6-longkey', { key: 'aa'.repeat(131), input: 'Test Using Larger Than Block-Size Key - Hash Key First' }),
  preset('rfc2202-md5-tc1', { hash: 'md5:md5', key: '0b'.repeat(16) }),
  preset('rfc2202-sha1-tc1', { hash: 'sha1:sha-1' }),
  preset('hmac-sha512-tc1', { hash: 'sha512:sha-512' }),
  preset('hmac-sha3-256-sample', { hash: 'sha3:sha3-256', key: WYCHEPROOF_SHA3_256_KEY, encoding: 'hex', input: WYCHEPROOF_SHA3_256_MESSAGE }),
  preset('verify-pass', { expected: RFC4231_TC1_TAG }),
  preset('verify-fail', { expected: RFC4231_TC1_TAG_LAST_BYTE_WRONG }),
];

const hexField = (name: string): ParamField => ({ name, kind: 'hex', labelKey: `${NS}.param.${name}`, hintKey: `${NS}.param.${name}Hint` });

export const HMAC_PARAM_FIELDS: ParamField[] = [
  { name: 'hash', kind: 'port', port: 'Hash', member: true, labelKey: `${NS}.param.hash`, hintKey: `${NS}.param.hashHint` },
  hexField('key'),
  selectField(NS, 'encoding', HASH_ENCODINGS),
  messageField(NS, HMAC_MAX_MESSAGE_BYTES),
  selectField(NS, 'tagLength', HMAC_TAG_LENGTHS),
  hexField('expected'),
];

/** The recorded ops in order (`truncate` only when t < L, `verify` only with an expected tag). */
export const HMAC_OP_NAMES = ['keyPrep', 'ipad', 'innerBlock', 'innerMessage', 'opad', 'outerBlock', 'outer', 'truncate', 'verify'] as const;
export type HmacOpName = (typeof HMAC_OP_NAMES)[number];

export const HMAC_OPS = opLabels(NS, HMAC_OP_NAMES);

/** Hex of `minBytes` … `maxBytes` bytes, normalised; `name` picks the `<ns>.error.<name>Length` message. */
function readHexParam(input: unknown, maxBytes: number, name: string): ValidationResult<string> {
  const hex = parseHexOfLength(input, messageLengths(maxBytes), { invalidType: `${NS}.error.invalidParams`, wrongLength: `${NS}.error.${name}Length` });
  return hex.ok ? { ok: true, value: hex.hex } : hex;
}

/** Validates and normalises params; the tag-length rule needs the hash's L and is checked at run time. */
export function validateHmacParams(params: unknown): ValidationResult<HmacParams> {
  if (typeof params !== 'object' || params === null) return paramError(NS, 'invalidParams');
  const record = params as Record<string, unknown>;
  const hash = readPortMemberRef(record['hash']);
  if (hash === undefined) return paramError(NS, 'hash');
  const encoding = readOption(record['encoding'], HASH_ENCODINGS);
  if (encoding === undefined) return paramError(NS, 'encoding', { encoding: String(record['encoding']) });
  const tagLength = readOption(record['tagLength'], HMAC_TAG_LENGTHS);
  if (tagLength === undefined) return paramError(NS, 'tagLengthOption', { tagLength: String(record['tagLength']) });
  const key = readHexParam(record['key'], HMAC_MAX_KEY_BYTES, 'key');
  if (!key.ok) return key;
  const input = readMessageInput(NS, record['input'], encoding, HMAC_MAX_MESSAGE_BYTES);
  if (!input.ok) return input;
  const expected = readHexParam(record['expected'], HMAC_MAX_TAG_BYTES, 'expected');
  if (!expected.ok) return expected;
  return { ok: true, value: { hash, key: key.value, encoding, input: input.value, tagLength, expected: expected.value } };
}

export const hmacManifest = definePrimitive<HmacParams>({
  kind: 'primitive',
  id: 'hmac',
  apiVersion: 1,
  family: 'mac',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'RFC 2104 §2 (HMAC), §5 (truncated output)',
    'NIST FIPS 198-1 §4 (HMAC specification), §5 (truncated output)',
    'Bellare, Canetti, Krawczyk: Keying Hash Functions for Message Authentication (CRYPTO 1996)',
    'RFC 4231 §4 (HMAC-SHA-224/256/384/512 test cases)',
    'RFC 2202 §2–3 (HMAC-MD5 and HMAC-SHA-1 test cases)',
    'C2SP Wycheproof hmac_sha3_256_test.json',
  ],
  facets: ['state', 'values', 'narration', 'derivation', 'math'],
  presets: HMAC_PRESETS,
  defaults: { ...BASE },
  i18nNamespace: NS,
  paramFields: HMAC_PARAM_FIELDS,
  ops: HMAC_OPS,
  outputs: { tag: { labelKey: `${NS}.output.tag` }, verified: { labelKey: `${NS}.output.verified` } },
  validate: validateHmacParams,
  load: () => import('./module.ts'),
});

export default hmacManifest;
