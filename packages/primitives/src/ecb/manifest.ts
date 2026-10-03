import {
  definePrimitive,
  i18nRef,
  MODE_DIRECTIONS,
  MODE_PADDINGS,
  opLabels,
  readModeCommon,
  readOption,
  type ModeDirection,
  type ModePadding,
  type ParamField,
  type Preset,
  type ValidationResult,
} from '@cryventure/core';

/** Manifest for the ECB mode of operation over any `BlockCipher` (docs/M3.md §4). Imports core only. */
export interface EcbParams {
  cipher: string;
  keyHex: string;
  inputHex: string;
  direction: ModeDirection;
  padding: ModePadding;
}

const NS = 'plugin.ecb';

/** NIST SP 800-38A App. F (AES-128 key and the four plaintext blocks). */
const SP_KEY_128 = '2b7e151628aed2a6abf7158809cf4f3c';
const SP_PLAINTEXT =
  '6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710';
/** "ATTACK AT DAWN!!" twice: two equal blocks that ECB encrypts to two equal ciphertext blocks. */
const REPEATED_BLOCKS = '41545441434b204154204441574e2121'.repeat(2);
/** ECB-AES128 of REPEATED_BLOCKS with PKCS#7 under SP_KEY_128 (the module tests check it against the core reference). */
const REPEATED_BLOCKS_CIPHERTEXT = '541ff0c92b9251ae06c624c4a8ab2a85541ff0c92b9251ae06c624c4a8ab2a85a254be88e037ddd9d79fb6411c3f9df8';

function preset(id: string, inputHex: string, direction: ModeDirection, padding: ModePadding): Preset<EcbParams> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { cipher: 'aes', keyHex: SP_KEY_128, inputHex, direction, padding } };
}

export const ECB_PRESETS: Preset<EcbParams>[] = [
  preset('repeated-blocks', REPEATED_BLOCKS, 'encrypt', 'pkcs7'),
  preset('repeated-blocks-decrypt', REPEATED_BLOCKS_CIPHERTEXT, 'decrypt', 'pkcs7'),
  preset('sp800-38a-f11', SP_PLAINTEXT, 'encrypt', 'none'),
];

export const ECB_PARAM_FIELDS: ParamField[] = [
  { name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: `${NS}.param.cipher`, hintKey: `${NS}.param.cipherHint` },
  { name: 'keyHex', kind: 'hex', labelKey: `${NS}.param.key`, hintKey: `${NS}.param.keyHint` },
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

export const ECB_OP_NAMES = ['pad', 'encryptBlock', 'decryptBlock', 'emit', 'unpad'] as const;
export type EcbOpName = (typeof ECB_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`). */
export const ECB_OPS = opLabels(NS, ECB_OP_NAMES);

/** Validates and normalises params (hex lowercased, separators stripped); the key size is checked against the cipher at run time. */
export function validateEcbParams(params: unknown): ValidationResult<EcbParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const record = params as Record<string, unknown>;
  const common = readModeCommon(record, NS);
  if (!common.ok) return common;
  const direction = readOption(record['direction'], MODE_DIRECTIONS);
  if (direction === undefined) return { ok: false, error: i18nRef(`${NS}.error.direction`) };
  const padding = readOption(record['padding'], MODE_PADDINGS);
  if (padding === undefined) return { ok: false, error: i18nRef(`${NS}.error.padding`) };
  return { ok: true, value: { ...common.value, direction, padding } };
}

export const ecbManifest = definePrimitive<EcbParams>({
  kind: 'primitive',
  id: 'ecb',
  apiVersion: 1,
  family: 'mode',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['NIST SP 800-38A §6.1 (ECB mode)', 'NIST SP 800-38A App. F.1 (ECB-AES test vectors)', 'RFC 5652 §6.3 (PKCS#7 padding)'],
  facets: ['state', 'values', 'narration', 'chain', 'wire'],
  presets: ECB_PRESETS,
  defaults: { ...ECB_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: ECB_PARAM_FIELDS,
  ops: ECB_OPS,
  outputs: {
    ciphertext: { labelKey: `${NS}.value.ciphertext` },
    plaintext: { labelKey: `${NS}.value.plaintext` },
    padded: { labelKey: `${NS}.value.padded` },
  },
  validate: validateEcbParams,
  load: () => import('./module.ts'),
});

export default ecbManifest;
