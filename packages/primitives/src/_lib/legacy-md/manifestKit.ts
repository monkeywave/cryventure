import { i18nRef, opLabels, parseHexOfLength, readOption, utf8Bytes, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';

/**
 * The manifest parts the `md5` and `sha1` producers share (docs/M6.md §2e): message encodings,
 * detail levels, the recorded op names, param fields, presets and validation. Manifests load
 * eagerly, so this module imports `@cryventure/core` only; the recorder stays behind `load()`.
 */

export const LEGACY_ENCODINGS = ['utf8', 'hex'] as const;
export type LegacyEncoding = (typeof LEGACY_ENCODINGS)[number];
export const LEGACY_DETAILS = ['round', 'block'] as const;
export type LegacyDetail = (typeof LEGACY_DETAILS)[number];

/**
 * The recorded ops: `pad` once before block 0; per block `init`, then at `round` detail
 * (`schedule t` for t ≥ 16, SHA-1 only) and `round t`, or at `block` detail one `compress`; then
 * `feedForward`; after the last block `output`.
 */
export const SHA1_OP_NAMES = ['pad', 'init', 'schedule', 'round', 'compress', 'feedForward', 'output'] as const;
export const MD5_OP_NAMES = ['pad', 'init', 'round', 'compress', 'feedForward', 'output'] as const;
export type LegacyOpName = (typeof SHA1_OP_NAMES)[number];

/** At most 128 message bytes (three blocks after padding) in either encoding; also the text field's `maxLength`. */
export const LEGACY_MAX_MESSAGE_BYTES = 128;
const MESSAGE_LENGTHS = Array.from({ length: LEGACY_MAX_MESSAGE_BYTES + 1 }, (_, length) => length);

export interface LegacyHashParams {
  encoding: LegacyEncoding;
  /** The message: UTF-8 text, or hex (normalised to lowercase without separators). */
  input: string;
  detail: LegacyDetail;
}

const legacyError = (ns: string, name: string, params?: Record<string, string | number>) => ({ ok: false as const, error: i18nRef(`${ns}.error.${name}`, params) });

function selectField(ns: string, name: string, options: readonly string[]): ParamField {
  return {
    name,
    kind: 'select',
    labelKey: `${ns}.param.${name}`,
    hintKey: `${ns}.param.${name}Hint`,
    options: options.map((value) => ({ value, labelKey: `${ns}.param.${name}Option.${value}` })),
  };
}

/** The message text: UTF-8 of at most 128 bytes, or hex of 0 … 128 bytes (normalised to lowercase). */
export function readLegacyInput(ns: string, input: unknown, encoding: LegacyEncoding): ValidationResult<string> {
  if (typeof input !== 'string') return legacyError(ns, 'invalidParams');
  if (encoding === 'hex') {
    const hex = parseHexOfLength(input, MESSAGE_LENGTHS, { invalidType: `${ns}.error.invalidParams`, wrongLength: `${ns}.error.inputLength` });
    return hex.ok ? { ok: true, value: hex.hex } : hex;
  }
  const length = utf8Bytes(input).length;
  return length <= LEGACY_MAX_MESSAGE_BYTES ? { ok: true, value: input } : legacyError(ns, 'inputLength', { length });
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateLegacyParams(ns: string, params: unknown): ValidationResult<LegacyHashParams> {
  if (typeof params !== 'object' || params === null) return legacyError(ns, 'invalidParams');
  const record = params as Record<string, unknown>;
  const encoding = readOption(record['encoding'], LEGACY_ENCODINGS);
  if (encoding === undefined) return legacyError(ns, 'encoding', { encoding: String(record['encoding']) });
  const detail = readOption(record['detail'], LEGACY_DETAILS);
  if (detail === undefined) return legacyError(ns, 'detail', { detail: String(record['detail']) });
  const input = readLegacyInput(ns, record['input'], encoding);
  if (!input.ok) return input;
  return { ok: true, value: { encoding, input: input.value, detail } };
}

/** The param fields: encoding, the message text and the detail level. */
export function legacyParamFields(ns: string): ParamField[] {
  return [
    selectField(ns, 'encoding', LEGACY_ENCODINGS),
    { name: 'input', kind: 'text', labelKey: `${ns}.param.input`, hintKey: `${ns}.param.inputHint`, maxLength: LEGACY_MAX_MESSAGE_BYTES },
    selectField(ns, 'detail', LEGACY_DETAILS),
  ];
}

/** The op labels (`<ns>.op.<name>`, `<ns>.opShort.<name>`) of `names`. */
export const legacyOps = <Op extends LegacyOpName>(ns: string, names: readonly Op[]) => opLabels(ns, names);

/** A UTF-8 preset labelled `<ns>.preset.<id>`. */
export function legacyPreset(ns: string, id: string, input: string, detail: LegacyDetail = 'round'): Preset<LegacyHashParams> {
  return { id, labelKey: `${ns}.preset.${id}`, params: { encoding: 'utf8', input, detail } };
}
