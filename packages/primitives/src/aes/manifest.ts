import {
  definePrimitive,
  i18nRef,
  parseHex,
  toHex,
  type I18nRef,
  type ParamField,
  type Preset,
  type ValidationResult,
} from '@cryventure/core';

/** Manifest for the AES primitive. Imports core only; the implementation loads lazily. */
export type AesDetail = 'round' | 'op';

export interface AesParams {
  keyHex: string;
  plaintextHex: string;
  detail: AesDetail;
}

const KEY_LENGTHS = [16, 24, 32];
const BLOCK_LENGTH = 16;
const DETAILS: readonly string[] = ['round', 'op'] satisfies AesDetail[];
const PLAINTEXT_C = '00112233445566778899aabbccddeeff';
const KEY_256 = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

function preset(id: string, keyHex: string, plaintextHex: string): Preset<AesParams> {
  return {
    id,
    labelKey: `plugin.aes.preset.${id}`,
    params: { keyHex, plaintextHex, detail: 'op' },
  };
}

export const AES_PRESETS: Preset<AesParams>[] = [
  preset('fips197-c1', KEY_256.slice(0, 32), PLAINTEXT_C),
  preset('fips197-c2', KEY_256.slice(0, 48), PLAINTEXT_C),
  preset('fips197-c3', KEY_256, PLAINTEXT_C),
  preset('fips197-b', '2b7e151628aed2a6abf7158809cf4f3c', '3243f6a8885a308d313198a2e0370734'),
];

const NS = 'plugin.aes';

/** Inputs for the generic param panel; labels and hints live in this plugin's catalogs. */
export const AES_PARAM_FIELDS: ParamField[] = [
  { name: 'keyHex', kind: 'hex', labelKey: `${NS}.param.key`, hintKey: `${NS}.param.keyHint` },
  { name: 'plaintextHex', kind: 'hex', labelKey: `${NS}.param.plaintext`, hintKey: `${NS}.param.plaintextHint` },
  {
    name: 'detail',
    kind: 'select',
    labelKey: `${NS}.param.detail`,
    hintKey: `${NS}.param.detailHint`,
    options: DETAILS.map((detail) => ({ value: detail, labelKey: `${NS}.param.detailOption.${detail}` })),
  },
];

type HexCheck = { ok: true; hex: string } | { ok: false; error: I18nRef };

/** Parses hex and checks its byte length against `allowed`; `lengthErrorKey` reports a mismatch. */
export function checkHexLength(
  input: unknown,
  allowed: readonly number[],
  lengthErrorKey: string,
): HexCheck {
  if (typeof input !== 'string')
    return { ok: false, error: i18nRef('plugin.aes.error.invalidParams') };
  const parsed = parseHex(input);
  if (!parsed.ok) return parsed;
  if (!allowed.includes(parsed.bytes.length)) {
    return { ok: false, error: i18nRef(lengthErrorKey, { length: parsed.bytes.length }) };
  }
  return { ok: true, hex: toHex(parsed.bytes) };
}

function readDetail(input: unknown): AesDetail | undefined {
  if (input === undefined) return 'op';
  return typeof input === 'string' && DETAILS.includes(input) ? (input as AesDetail) : undefined;
}

/** Validates and normalises params (hex lowercased, separators stripped, detail defaults to 'op'). */
export function validateAesParams(params: unknown): ValidationResult<AesParams> {
  if (typeof params !== 'object' || params === null)
    return { ok: false, error: i18nRef('plugin.aes.error.invalidParams') };
  const record = params as Record<string, unknown>;
  const key = checkHexLength(record['keyHex'], KEY_LENGTHS, 'plugin.aes.error.keyLength');
  if (!key.ok) return key;
  const plaintext = checkHexLength(
    record['plaintextHex'],
    [BLOCK_LENGTH],
    'plugin.aes.error.plaintextLength',
  );
  if (!plaintext.ok) return plaintext;
  const detail = readDetail(record['detail']);
  if (detail === undefined)
    return {
      ok: false,
      error: i18nRef('plugin.aes.error.detail', { detail: String(record['detail']) }),
    };
  return { ok: true, value: { keyHex: key.hex, plaintextHex: plaintext.hex, detail } };
}

export const aesManifest = definePrimitive<AesParams>({
  kind: 'primitive',
  id: 'aes',
  apiVersion: 1,
  family: 'block-cipher',
  implements: ['BlockCipher'],
  titleKey: 'plugin.aes.title',
  refs: [
    'FIPS 197-upd1 §4 (GF(2^8) arithmetic)',
    'FIPS 197-upd1 §5.1 (Cipher: SubBytes, ShiftRows, MixColumns, AddRoundKey)',
    'FIPS 197-upd1 §5.2 (KeyExpansion)',
    'FIPS 197-upd1 §5.3 (InvCipher)',
    'FIPS 197-upd1 App. A–C (test vectors)',
  ],
  facets: ['state', 'values', 'narration'],
  presets: AES_PRESETS,
  defaults: { ...AES_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: AES_PARAM_FIELDS,
  validate: validateAesParams,
  load: () => import('./module.ts'),
});

export default aesManifest;
