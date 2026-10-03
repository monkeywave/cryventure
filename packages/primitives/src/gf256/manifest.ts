import { definePrimitive, i18nRef, opLabels, parseHexOfLength, readOption, type HexOfLengthResult, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/**
 * Manifest for the GF(2^8) calculator: xtime (a·x), gmul (a·b) and ginv (a⁻¹) in the AES field.
 * Imports core only; the implementation loads lazily.
 */
export type Gf256Op = 'xtime' | 'gmul' | 'ginv';

export interface Gf256Params {
  op: Gf256Op;
  aHex: string;
  /** Only used by `gmul`; xtime and ginv ignore it (validated anyway, so presets stay uniform). */
  bHex: string;
}

const NS = 'plugin.gf256';
export const GF256_OPERATIONS: readonly Gf256Op[] = ['xtime', 'gmul', 'ginv'];

function preset(id: string, op: Gf256Op, aHex: string, bHex = '01'): Preset<Gf256Params> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { op, aHex, bHex } };
}

/** FIPS 197 §4.2 / §4.2.1 examples plus xtime with and without carry and the inverse (incl. {00}). */
export const GF256_PRESETS: Preset<Gf256Params>[] = [
  preset('fips197-mul', 'gmul', '57', '83'),
  preset('fips197-xtime-chain', 'gmul', '57', '13'),
  preset('xtime-no-carry', 'xtime', '57'),
  preset('xtime-carry', 'xtime', 'ae'),
  preset('inverse', 'ginv', '53'),
  preset('inverse-zero', 'ginv', '00'),
];

/** Inputs for the generic param panel (label/hint keys must exist in EN and DE; the contract kit checks). */
export const GF256_PARAM_FIELDS: ParamField[] = [
  {
    name: 'op',
    kind: 'select',
    labelKey: `${NS}.param.op`,
    hintKey: `${NS}.param.opHint`,
    options: GF256_OPERATIONS.map((op) => ({ value: op, labelKey: `${NS}.param.opOption.${op}` })),
  },
  { name: 'aHex', kind: 'hex', labelKey: `${NS}.param.a`, hintKey: `${NS}.param.aHint` },
  { name: 'bHex', kind: 'hex', labelKey: `${NS}.param.b`, hintKey: `${NS}.param.bHint` },
];

/** Every op the module records (`StateStep.op`). */
export const GF256_OP_NAMES = ['shift', 'reduce', 'xtime', 'add', 'skip', 'square', 'multiply', 'result'] as const;
export type Gf256StepOp = (typeof GF256_OP_NAMES)[number];

export const GF256_OPS = opLabels(NS, GF256_OP_NAMES);

/** Parses exactly one byte of hex; `lengthErrorKey` reports a wrong byte count. */
export function readByteHex(input: unknown, lengthErrorKey: string): HexOfLengthResult {
  return parseHexOfLength(input, [1], { invalidType: `${NS}.error.invalidParams`, wrongLength: lengthErrorKey });
}

/** Validates and normalises params (op checked, hex lowercased with separators stripped). */
export function validateGf256Params(params: unknown): ValidationResult<Gf256Params> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(`${NS}.error.invalidParams`) };
  const record = params as Record<string, unknown>;
  const op = readOption(record['op'], GF256_OPERATIONS);
  if (op === undefined) return { ok: false, error: i18nRef(`${NS}.error.op`, { op: String(record['op']) }) };
  const a = readByteHex(record['aHex'], `${NS}.error.aLength`);
  if (!a.ok) return a;
  const b = readByteHex(record['bHex'], `${NS}.error.bLength`);
  if (!b.ok) return b;
  return { ok: true, value: { op, aHex: a.hex, bHex: b.hex } };
}

export const gf256Manifest = definePrimitive<Gf256Params>({
  kind: 'primitive',
  id: 'gf256',
  apiVersion: 1,
  family: 'foundation',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['FIPS 197-upd1 §4.1 (addition)', 'FIPS 197-upd1 §4.2 (multiplication, xtime)', 'FIPS 197-upd1 §4.4 (multiplicative inverse)'],
  facets: ['state', 'values', 'narration', 'math'],
  presets: GF256_PRESETS,
  defaults: { ...GF256_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: GF256_PARAM_FIELDS,
  ops: GF256_OPS,
  outputs: { result: { labelKey: `${NS}.value.result` } },
  validate: validateGf256Params,
  load: () => import('./module.ts'),
});

export default gf256Manifest;
