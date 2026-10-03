import { definePrimitive, i18nRef, opLabels, readBlockParamHex, readModeCommon, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/**
 * Manifest for the CTR mode of operation over any `BlockCipher` (docs/M3.md §4). CTR is its own
 * inverse, so it has no direction, and it needs no padding. Imports core only.
 */
export interface CtrParams {
  cipher: string;
  keyHex: string;
  counterHex: string;
  inputHex: string;
}

const NS = 'plugin.ctr';

/** NIST SP 800-38A App. F.5 (AES-128 key, initial counter block and the four plaintext blocks). */
const SP_KEY_128 = '2b7e151628aed2a6abf7158809cf4f3c';
const SP_COUNTER = 'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff';
const SP_PLAINTEXT =
  '6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710';
/** "CTR needs no padding": 20 bytes, so the second keystream block is cut to 4 bytes. */
const SHORT_MESSAGE = '435452206e65656473206e6f2070616464696e67';

function preset(id: string, inputHex: string): Preset<CtrParams> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { cipher: 'aes', keyHex: SP_KEY_128, counterHex: SP_COUNTER, inputHex } };
}

export const CTR_PRESETS: Preset<CtrParams>[] = [preset('short-message', SHORT_MESSAGE), preset('sp800-38a-f51', SP_PLAINTEXT)];

export const CTR_PARAM_FIELDS: ParamField[] = [
  { name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: `${NS}.param.cipher`, hintKey: `${NS}.param.cipherHint` },
  { name: 'keyHex', kind: 'hex', labelKey: `${NS}.param.key`, hintKey: `${NS}.param.keyHint` },
  { name: 'counterHex', kind: 'hex', labelKey: `${NS}.param.counter`, hintKey: `${NS}.param.counterHint` },
  { name: 'inputHex', kind: 'hex', labelKey: `${NS}.param.input`, hintKey: `${NS}.param.inputHint` },
];

export const CTR_OP_NAMES = ['incrementCounter', 'encryptBlock', 'xorKeystream'] as const;
export type CtrOpName = (typeof CTR_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`). */
export const CTR_OPS = opLabels(NS, CTR_OP_NAMES);

/** Validates and normalises params (hex lowercased, separators stripped); key and counter sizes are checked against the cipher at run time. */
export function validateCtrParams(params: unknown): ValidationResult<CtrParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const record = params as Record<string, unknown>;
  const common = readModeCommon(record, NS);
  if (!common.ok) return common;
  const counter = readBlockParamHex(record['counterHex'], NS, `${NS}.error.counterLength`);
  if (!counter.ok) return counter;
  return { ok: true, value: { ...common.value, counterHex: counter.hex } };
}

export const ctrManifest = definePrimitive<CtrParams>({
  kind: 'primitive',
  id: 'ctr',
  apiVersion: 1,
  family: 'mode',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['NIST SP 800-38A §6.5 (CTR mode)', 'NIST SP 800-38A App. B.1 (standard incrementing function)', 'NIST SP 800-38A App. F.5 (CTR-AES test vectors)'],
  facets: ['state', 'values', 'narration', 'chain', 'wire'],
  presets: CTR_PRESETS,
  defaults: { ...CTR_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: CTR_PARAM_FIELDS,
  ops: CTR_OPS,
  outputs: {
    output: { labelKey: `${NS}.value.output` },
    keystream: { labelKey: `${NS}.value.keystream` },
  },
  validate: validateCtrParams,
  load: () => import('./module.ts'),
});

export default ctrManifest;
