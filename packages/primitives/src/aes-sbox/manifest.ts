import { definePrimitive, i18nRef, opLabels, parseHexOfLength, type HexOfLengthResult, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/** Manifest for the aes-sbox primitive (S-box derivation for one byte). Imports core only; the implementation loads lazily. */
export interface AesSboxParams {
  /** The S-box input x as exactly one hex byte. */
  byteHex: string;
}

const NS = 'plugin.aes-sbox';
export const AES_SBOX_INPUT_BYTES = 1;

const FIPS_EXAMPLE: AesSboxParams = { byteHex: '53' };

export const AES_SBOX_PRESETS: Preset<AesSboxParams>[] = [
  { id: 'fips-53', labelKey: `${NS}.preset.fips-53`, params: FIPS_EXAMPLE },
  { id: 'zero', labelKey: `${NS}.preset.zero`, params: { byteHex: '00' } },
  { id: 'one', labelKey: `${NS}.preset.one`, params: { byteHex: '01' } },
  { id: 'fips-c1-round1', labelKey: `${NS}.preset.fips-c1-round1`, params: { byteHex: '40' } },
];

/** Inputs for the generic param panel (label/hint keys must exist in EN and DE; the contract kit checks). */
export const AES_SBOX_PARAM_FIELDS: ParamField[] = [{ name: 'byteHex', kind: 'hex', labelKey: `${NS}.param.byte`, hintKey: `${NS}.param.byteHint` }];

export const AES_SBOX_OP_NAMES = ['load', 'square', 'multiply', 'inverse', 'affineBit', 'result'] as const;
export type AesSboxOpName = (typeof AES_SBOX_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`); the player and debugger show them. */
export const AES_SBOX_OPS = opLabels(NS, AES_SBOX_OP_NAMES);

/** Parses the one-byte input; non-strings and other lengths become plugin errors. */
export function readByteHex(input: unknown): HexOfLengthResult {
  return parseHexOfLength(input, [AES_SBOX_INPUT_BYTES], { invalidType: `${NS}.error.invalidParams`, wrongLength: `${NS}.error.byteLength` });
}

/** Validates and normalises params (hex lowercased, separators stripped). */
export function validateAesSboxParams(params: unknown): ValidationResult<AesSboxParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const byte = readByteHex((params as Record<string, unknown>)['byteHex']);
  if (!byte.ok) return byte;
  return { ok: true, value: { byteHex: byte.hex } };
}

export const aesSboxManifest = definePrimitive<AesSboxParams>({
  kind: 'primitive',
  id: 'aes-sbox',
  apiVersion: 1,
  family: 'block-cipher',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['FIPS 197-upd1 §4.4 (multiplicative inverses in GF(2^8))', 'FIPS 197-upd1 §5.1.1 (SubBytes: S-box = affine map of the inverse)'],
  facets: ['state', 'values', 'narration', 'math', 'table'],
  presets: AES_SBOX_PRESETS,
  defaults: FIPS_EXAMPLE,
  i18nNamespace: NS,
  paramFields: AES_SBOX_PARAM_FIELDS,
  ops: AES_SBOX_OPS,
  outputs: { sbox: { labelKey: `${NS}.output.sbox` }, inverse: { labelKey: `${NS}.output.inverse` } },
  validate: validateAesSboxParams,
  load: () => import('./module.ts'),
});

export default aesSboxManifest;
