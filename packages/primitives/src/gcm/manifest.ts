import {
  definePrimitive,
  GCM_TAG_BYTES,
  i18nRef,
  MODE_DIRECTIONS,
  MODE_MAX_INPUT_BYTES,
  MODE_MAX_KEY_BYTES,
  opLabels,
  parseHexOfLength,
  readOption,
  readProducerId,
  type HexOfLengthResult,
  type ModeDirection,
  type ParamField,
  type Preset,
  type ValidationResult,
} from '@cryventure/core';

/**
 * Manifest for GCM (NIST SP 800-38D) over any 128-bit `BlockCipher` (docs/M4.md §2b): CTR
 * encryption plus a GHASH tag. Imports core only.
 */
export interface GcmParams {
  cipher: string;
  keyHex: string;
  ivHex: string;
  aadHex: string;
  inputHex: string;
  direction: ModeDirection;
  /** Decrypt only: the received tag, `tagBytes` long (ignored and normalised to empty when encrypting). */
  tagHex: string;
  /** One of `GCM_TAG_BYTES` as a decimal string (a select param). */
  tagBytes: string;
}

const NS = 'plugin.gcm';

/** Upper bound for the IV param (SP 800-38D allows longer IVs; 64 bytes keep the J0 GHASH on screen). */
export const GCM_MAX_IV_BYTES = 64;
/** Upper bound for the AAD param. */
export const GCM_MAX_AAD_BYTES = 64;
/** The select options of `tagBytes`. */
export const GCM_TAG_BYTE_OPTIONS: readonly string[] = GCM_TAG_BYTES.map(String);

/** McGrew–Viega test case 2: the all-zero AES-128 key and IV, one zero block. */
const TC2 = { keyHex: '00000000000000000000000000000000', ivHex: '000000000000000000000000', aadHex: '', inputHex: '00000000000000000000000000000000' };
/** McGrew–Viega test case 4: AES-128, 96-bit IV, 20 bytes of AAD, 60 bytes of plaintext. */
const TC4_KEY = 'feffe9928665731c6d6a8f9467308308';
const TC4_IV = 'cafebabefacedbaddecaf888';
const TC4_AAD = 'feedfacedeadbeeffeedfacedeadbeefabaddad2';
const TC4_PLAINTEXT = 'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39';
const TC4_CIPHERTEXT = '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091';
const TC4_TAG = '5bc94fbc3221a5db94fae95ae7121a47';
/** TC4's tag with the lowest bit of its first byte flipped: a forgery attempt that must FAIL. */
const TC4_TAG_FLIPPED = '5ac94fbc3221a5db94fae95ae7121a47';
/** McGrew–Viega test case 6: TC4 with a 60-byte IV, so J0 comes from GHASH. */
const TC6_IV = '9313225df88406e555909c5aff5269aa6a7a9538534f7da1e4c303d2a318a728c3c0c95156809539fcf0e2429a6b525416aedbf5a0de6a57a637b39b';
const TC4 = { keyHex: TC4_KEY, ivHex: TC4_IV, aadHex: TC4_AAD };

function preset(id: string, params: Partial<GcmParams>): Preset<GcmParams> {
  const base: GcmParams = { cipher: 'aes', ...TC2, direction: 'encrypt', tagHex: '', tagBytes: '16' };
  return { id, labelKey: `${NS}.preset.${id}`, params: { ...base, ...params } };
}

export const GCM_PRESETS: Preset<GcmParams>[] = [
  preset('mcgrew-viega-tc2', {}),
  preset('mcgrew-viega-tc4', { ...TC4, inputHex: TC4_PLAINTEXT }),
  preset('mcgrew-viega-tc6', { ...TC4, ivHex: TC6_IV, inputHex: TC4_PLAINTEXT }),
  preset('gmac', { ...TC4, inputHex: '' }),
  preset('truncated-tag', { ...TC4, inputHex: TC4_PLAINTEXT, tagBytes: '12' }),
  preset('decrypt-valid', { ...TC4, inputHex: TC4_CIPHERTEXT, direction: 'decrypt', tagHex: TC4_TAG }),
  preset('decrypt-forged', { ...TC4, inputHex: TC4_CIPHERTEXT, direction: 'decrypt', tagHex: TC4_TAG_FLIPPED }),
];

const hexField = (name: string, label: string): ParamField => ({ name, kind: 'hex', labelKey: `${NS}.param.${label}`, hintKey: `${NS}.param.${label}Hint` });

export const GCM_PARAM_FIELDS: ParamField[] = [
  { name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: `${NS}.param.cipher`, hintKey: `${NS}.param.cipherHint` },
  hexField('keyHex', 'key'),
  hexField('ivHex', 'iv'),
  hexField('aadHex', 'aad'),
  hexField('inputHex', 'input'),
  {
    name: 'direction',
    kind: 'select',
    labelKey: `${NS}.param.direction`,
    options: MODE_DIRECTIONS.map((direction) => ({ value: direction, labelKey: `${NS}.param.directionOption.${direction}` })),
  },
  hexField('tagHex', 'tag'),
  {
    name: 'tagBytes',
    kind: 'select',
    labelKey: `${NS}.param.tagBytes`,
    hintKey: `${NS}.param.tagBytesHint`,
    options: GCM_TAG_BYTE_OPTIONS.map((bytes) => ({ value: bytes, labelKey: `${NS}.param.tagBytesOption.${bytes}` })),
  },
];

export const GCM_OP_NAMES = ['hashKey', 'j0', 'inc32', 'encryptCounter', 'xorKeystream', 'ghashBlock', 'lengthBlock', 'encryptJ0', 'tag', 'verify'] as const;
export type GcmOpName = (typeof GCM_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`). */
export const GCM_OPS = opLabels(NS, GCM_OP_NAMES);

/** Lengths 0..max (or 1..max) for `parseHexOfLength`. */
export function byteLengths(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

const KEY_LENGTHS = byteLengths(1, MODE_MAX_KEY_BYTES);
const IV_LENGTHS = byteLengths(1, GCM_MAX_IV_BYTES);
const AAD_LENGTHS = byteLengths(0, GCM_MAX_AAD_BYTES);
const INPUT_LENGTHS = byteLengths(0, MODE_MAX_INPUT_BYTES);

function readHex(record: Record<string, unknown>, name: string, lengths: readonly number[], errorName: string): HexOfLengthResult {
  return parseHexOfLength(record[name], lengths, { invalidType: `${NS}.error.invalidParams`, wrongLength: `${NS}.error.${errorName}` });
}

/** The tag param: exactly `tagBytes` bytes when decrypting; ignored (normalised to empty) when encrypting, which computes the tag. */
function readTag(record: Record<string, unknown>, direction: ModeDirection, tagBytes: number): HexOfLengthResult {
  if (direction === 'encrypt') return { ok: true, bytes: new Uint8Array(0), hex: '' };
  const result = parseHexOfLength(record['tagHex'], [tagBytes], {
    invalidType: `${NS}.error.invalidParams`,
    wrongLength: `${NS}.error.tagLength`,
  });
  if (result.ok || result.error.key !== `${NS}.error.tagLength`) return result;
  return { ok: false, error: i18nRef(`${NS}.error.tagLength`, { ...result.error.params, tagBytes }) };
}

/** `tagBytes` as a select value; numbers are accepted and normalised to their string. */
function readTagBytes(input: unknown): string | undefined {
  return readOption(typeof input === 'number' ? String(input) : input, GCM_TAG_BYTE_OPTIONS);
}

type HexParams = Pick<GcmParams, 'keyHex' | 'ivHex' | 'aadHex' | 'inputHex'>;

function readHexParams(record: Record<string, unknown>): ValidationResult<HexParams> {
  const key = readHex(record, 'keyHex', KEY_LENGTHS, 'keyLength');
  if (!key.ok) return key;
  const iv = readHex(record, 'ivHex', IV_LENGTHS, 'ivLength');
  if (!iv.ok) return iv;
  const aad = readHex(record, 'aadHex', AAD_LENGTHS, 'aadLength');
  if (!aad.ok) return aad;
  const input = readHex(record, 'inputHex', INPUT_LENGTHS, 'inputLength');
  if (!input.ok) return input;
  return { ok: true, value: { keyHex: key.hex, ivHex: iv.hex, aadHex: aad.hex, inputHex: input.hex } };
}

/**
 * Validates and normalises params (hex lowercased, separators stripped). AAD and input may be empty
 * (empty input = GMAC); the key size is checked against the cipher at run time.
 */
export function validateGcmParams(params: unknown): ValidationResult<GcmParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const record = params as Record<string, unknown>;
  const cipher = readProducerId(record['cipher']);
  if (cipher === undefined) return { ok: false, error: i18nRef(`${NS}.error.cipher`) };
  const hex = readHexParams(record);
  if (!hex.ok) return hex;
  const direction = readOption(record['direction'], MODE_DIRECTIONS);
  if (direction === undefined) return { ok: false, error: i18nRef(`${NS}.error.direction`) };
  const tagBytes = readTagBytes(record['tagBytes']);
  if (tagBytes === undefined) return { ok: false, error: i18nRef(`${NS}.error.tagBytes`) };
  const tag = readTag(record, direction, Number(tagBytes));
  if (!tag.ok) return tag;
  return { ok: true, value: { cipher, ...hex.value, direction, tagHex: tag.hex, tagBytes } };
}

export const gcmManifest = definePrimitive<GcmParams>({
  kind: 'primitive',
  id: 'gcm',
  apiVersion: 1,
  family: 'mode',
  implements: [],
  titleKey: `${NS}.title`,
  refs: [
    'NIST SP 800-38D §6–7 (GCM and GMAC)',
    'NIST SP 800-38D Appendix C (short tags)',
    'McGrew & Viega, "The Galois/Counter Mode of Operation (GCM)", revised 2005, Appendix B (test cases)',
    'Project Wycheproof, testvectors_v1/aes_gcm_test.json (Apache-2.0)',
  ],
  facets: ['state', 'values', 'narration', 'chain', 'wire', 'field'],
  presets: GCM_PRESETS,
  defaults: { ...GCM_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: GCM_PARAM_FIELDS,
  ops: GCM_OPS,
  outputs: {
    ciphertext: { labelKey: `${NS}.value.ciphertext` },
    tag: { labelKey: `${NS}.value.tag` },
    plaintext: { labelKey: `${NS}.value.plaintext` },
  },
  validate: validateGcmParams,
  load: () => import('./module.ts'),
});

export default gcmManifest;
