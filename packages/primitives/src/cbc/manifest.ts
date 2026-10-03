import {
  definePrimitive,
  i18nRef,
  MODE_DIRECTIONS,
  MODE_PADDINGS,
  opLabels,
  readBlockParamHex,
  readModeCommon,
  readOption,
  type ModeDirection,
  type ModePadding,
  type ParamField,
  type Preset,
  type ValidationResult,
} from '@cryventure/core';

/** Manifest for the CBC mode of operation over any `BlockCipher` (docs/M3.md §4). Imports core only. */
export interface CbcParams {
  cipher: string;
  keyHex: string;
  ivHex: string;
  inputHex: string;
  direction: ModeDirection;
  padding: ModePadding;
}

const NS = 'plugin.cbc';

/** NIST SP 800-38A App. F (AES-128 key, IV and the four plaintext blocks). */
const SP_KEY_128 = '2b7e151628aed2a6abf7158809cf4f3c';
const SP_IV = '000102030405060708090a0b0c0d0e0f';
const SP_PLAINTEXT =
  '6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710';
/** "ATTACK AT DAWN!!" twice: two equal blocks that CBC encrypts differently. */
const REPEATED_BLOCKS = '41545441434b204154204441574e2121'.repeat(2);
/** CBC-AES128 of REPEATED_BLOCKS with PKCS#7 under SP_KEY_128 and SP_IV (the module tests check it against the core reference). */
const REPEATED_BLOCKS_CIPHERTEXT = 'd4d884b41d73a43210dd016d64d82e52b0117a218182ee3bc8e39d9093fb3b27bf48eacf1af5d993343034e7539daba0';

function preset(id: string, inputHex: string, direction: ModeDirection, padding: ModePadding): Preset<CbcParams> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { cipher: 'aes', keyHex: SP_KEY_128, ivHex: SP_IV, inputHex, direction, padding } };
}

export const CBC_PRESETS: Preset<CbcParams>[] = [
  preset('repeated-blocks', REPEATED_BLOCKS, 'encrypt', 'pkcs7'),
  preset('repeated-blocks-decrypt', REPEATED_BLOCKS_CIPHERTEXT, 'decrypt', 'pkcs7'),
  preset('sp800-38a-f21', SP_PLAINTEXT, 'encrypt', 'none'),
];

export const CBC_PARAM_FIELDS: ParamField[] = [
  { name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: `${NS}.param.cipher`, hintKey: `${NS}.param.cipherHint` },
  { name: 'keyHex', kind: 'hex', labelKey: `${NS}.param.key`, hintKey: `${NS}.param.keyHint` },
  { name: 'ivHex', kind: 'hex', labelKey: `${NS}.param.iv`, hintKey: `${NS}.param.ivHint` },
  { name: 'inputHex', kind: 'hex', labelKey: `${NS}.param.input`, hintKey: `${NS}.param.inputHint` },
  {
    name: 'direction',
    kind: 'select',
    labelKey: `${NS}.param.direction`,
    options: MODE_DIRECTIONS.map((direction) => ({ value: direction, labelKey: `${NS}.param.directionOption.${direction}` })),
  },
  {
    name: 'padding',
    kind: 'select',
    labelKey: `${NS}.param.padding`,
    hintKey: `${NS}.param.paddingHint`,
    options: MODE_PADDINGS.map((padding) => ({ value: padding, labelKey: `${NS}.param.paddingOption.${padding}` })),
  },
];

export const CBC_OP_NAMES = ['pad', 'xorChain', 'encryptBlock', 'decryptBlock', 'emit', 'unpad'] as const;
export type CbcOpName = (typeof CBC_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`). */
export const CBC_OPS = opLabels(NS, CBC_OP_NAMES);

/** Validates and normalises params (hex lowercased, separators stripped); key and IV sizes are checked against the cipher at run time. */
export function validateCbcParams(params: unknown): ValidationResult<CbcParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const record = params as Record<string, unknown>;
  const common = readModeCommon(record, NS);
  if (!common.ok) return common;
  const iv = readBlockParamHex(record['ivHex'], NS, `${NS}.error.ivLength`);
  if (!iv.ok) return iv;
  const direction = readOption(record['direction'], MODE_DIRECTIONS);
  if (direction === undefined) return { ok: false, error: i18nRef(`${NS}.error.direction`) };
  const padding = readOption(record['padding'], MODE_PADDINGS);
  if (padding === undefined) return { ok: false, error: i18nRef(`${NS}.error.padding`) };
  return { ok: true, value: { ...common.value, ivHex: iv.hex, direction, padding } };
}

export const cbcManifest = definePrimitive<CbcParams>({
  kind: 'primitive',
  id: 'cbc',
  apiVersion: 1,
  family: 'mode',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['NIST SP 800-38A §6.2 (CBC mode)', 'NIST SP 800-38A App. F.2 (CBC-AES test vectors)', 'RFC 5652 §6.3 (PKCS#7 padding)'],
  facets: ['state', 'values', 'narration', 'chain', 'wire'],
  presets: CBC_PRESETS,
  defaults: { ...CBC_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: CBC_PARAM_FIELDS,
  ops: CBC_OPS,
  outputs: {
    ciphertext: { labelKey: `${NS}.value.ciphertext` },
    plaintext: { labelKey: `${NS}.value.plaintext` },
    padded: { labelKey: `${NS}.value.padded` },
  },
  validate: validateCbcParams,
  load: () => import('./module.ts'),
});

export default cbcManifest;
