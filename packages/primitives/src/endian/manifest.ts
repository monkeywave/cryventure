import { definePrimitive, i18nRef, parseHex, toHex, type OpLabels, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/** Manifest for the byte-order (endianness) primitive. Imports core only; the implementation loads lazily. */
export type EndianWidth = 'u16' | 'u32' | 'u64';

export interface EndianParams {
  /** The integer as humans write it: most significant byte first, zero-padded to the width. */
  valueHex: string;
  width: EndianWidth;
}

const NS = 'plugin.endian';
export const ENDIAN_WIDTHS: readonly EndianWidth[] = ['u16', 'u32', 'u64'];
const WIDTH_BYTES: Readonly<Record<EndianWidth, number>> = { u16: 2, u32: 4, u64: 8 };

/** Number of bytes an integer of `width` occupies in memory. */
export function widthBytes(width: EndianWidth): number {
  return WIDTH_BYTES[width];
}

function preset(id: string, valueHex: string, width: EndianWidth): Preset<EndianParams> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { valueHex, width } };
}

export const ENDIAN_PRESETS: Preset<EndianParams>[] = [
  preset('classic', '0a0b0c0d', 'u32'),
  preset('u16', '1234', 'u16'),
  preset('aes-word', '2b7e1516', 'u32'),
  preset('u64', '0123456789abcdef', 'u64'),
];

/** Inputs for the generic param panel (label/hint/option keys must exist in EN and DE; the contract kit checks). */
export const ENDIAN_PARAM_FIELDS: ParamField[] = [
  { name: 'valueHex', kind: 'hex', labelKey: `${NS}.param.value`, hintKey: `${NS}.param.valueHint` },
  {
    name: 'width',
    kind: 'select',
    labelKey: `${NS}.param.width`,
    hintKey: `${NS}.param.widthHint`,
    options: ENDIAN_WIDTHS.map((width) => ({ value: width, labelKey: `${NS}.param.widthOption.${width}` })),
  },
];

export const ENDIAN_OP_NAMES = ['split', 'storeBig', 'storeLittle', 'compare'] as const;
export type EndianOpName = (typeof ENDIAN_OP_NAMES)[number];

/** Labels of every op the module records (`StateStep.op`); the player and debugger show them. */
export const ENDIAN_OPS = Object.fromEntries(
  ENDIAN_OP_NAMES.map((op) => [op, { labelKey: `${NS}.op.${op}`, shortLabelKey: `${NS}.opShort.${op}` }]),
) as Record<EndianOpName, OpLabels>;

const INVALID_PARAMS = `${NS}.error.invalidParams`;

function readWidth(input: unknown): EndianWidth | undefined {
  if (input === undefined) return 'u32';
  return ENDIAN_WIDTHS.find((width) => width === input);
}

/** Drops leading zero bytes, so `00001234` fits a u16 just like `1234`. */
export function significantBytes(bytes: Uint8Array): Uint8Array {
  const first = bytes.findIndex((byte) => byte !== 0);
  return first < 0 ? new Uint8Array(0) : bytes.subarray(first);
}

/** Left-pads `bytes` with zero bytes to exactly `length` (expects `bytes.length <= length`). */
export function padToWidth(bytes: Uint8Array, length: number): Uint8Array {
  const padded = new Uint8Array(length);
  padded.set(bytes, length - bytes.length);
  return padded;
}

/** Validates and normalises params: hex lowercased and zero-padded to the width, MSB first. */
export function validateEndianParams(params: unknown): ValidationResult<EndianParams> {
  if (typeof params !== 'object' || params === null) return { ok: false, error: i18nRef(INVALID_PARAMS) };
  const record = params as Record<string, unknown>;
  const width = readWidth(record['width']);
  if (width === undefined) return { ok: false, error: i18nRef(`${NS}.error.width`, { width: String(record['width']) }) };
  const valueHex = record['valueHex'];
  if (typeof valueHex !== 'string') return { ok: false, error: i18nRef(INVALID_PARAMS) };
  const parsed = parseHex(valueHex);
  if (!parsed.ok) return parsed;
  if (parsed.bytes.length === 0) return { ok: false, error: i18nRef(`${NS}.error.empty`) };
  const significant = significantBytes(parsed.bytes);
  const bytes = widthBytes(width);
  if (significant.length > bytes) {
    return { ok: false, error: i18nRef(`${NS}.error.tooWide`, { length: significant.length, bytes, width }) };
  }
  return { ok: true, value: { valueHex: toHex(padToWidth(significant, bytes)), width } };
}

export const endianManifest = definePrimitive<EndianParams>({
  kind: 'primitive',
  id: 'endian',
  apiVersion: 1,
  family: 'foundation',
  implements: [],
  titleKey: `${NS}.title`,
  refs: ['Cohen (1980), On Holy Wars and a Plea for Peace (IEN 137)', 'FIPS 197-upd1 §3.5 (words as 4-byte arrays)'],
  facets: ['state', 'values', 'narration'],
  presets: ENDIAN_PRESETS,
  defaults: { ...ENDIAN_PRESETS[0]!.params },
  i18nNamespace: NS,
  paramFields: ENDIAN_PARAM_FIELDS,
  ops: ENDIAN_OPS,
  outputs: { bigEndian: { labelKey: `${NS}.value.bigEndian` }, littleEndian: { labelKey: `${NS}.value.littleEndian` } },
  validate: validateEndianParams,
  load: () => import('./module.ts'),
});

export default endianManifest;
