import { opLabels, readOption, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';
import { paramError, selectField } from '../hashKit/manifestKit.ts';
import { readSha2Input, SHA2_DETAILS, SHA2_ENCODINGS, SHA2_MAX_MESSAGE_BYTES, SHA2_OP_NAMES, type Sha2Detail, type Sha2Encoding, type Sha2OpName } from '../sha2/manifestKit.ts';

/**
 * The manifest parts the `md5` and `sha1` producers share (docs/M6.md §2e): message encodings,
 * detail levels, the recorded op names, param fields, presets and validation. Manifests load
 * eagerly, so this module imports `@cryventure/core` and the SHA-2 and shared hash manifest kits
 * only; the recorder stays behind `load()`.
 */

/** The encodings, detail levels, message limit and SHA-1 op names are SHA-2's (`_lib/sha2/manifestKit.ts`). */
export const LEGACY_ENCODINGS = SHA2_ENCODINGS;
export type LegacyEncoding = Sha2Encoding;
export const LEGACY_DETAILS = SHA2_DETAILS;
export type LegacyDetail = Sha2Detail;

/**
 * The recorded ops: `pad` once before block 0; per block `init`, then at `round` detail
 * (`schedule t` for t ≥ 16, SHA-1 only) and `round t`, or at `block` detail one `compress`; then
 * `feedForward`; after the last block `output`.
 */
export const SHA1_OP_NAMES = SHA2_OP_NAMES;
export const MD5_OP_NAMES = ['pad', 'init', 'round', 'compress', 'feedForward', 'output'] as const;
export type LegacyOpName = Sha2OpName;

/** At most 128 message bytes (three blocks after padding) in either encoding; also the text field's `maxLength`. */
export const LEGACY_MAX_MESSAGE_BYTES = SHA2_MAX_MESSAGE_BYTES;

export interface LegacyHashParams {
  encoding: LegacyEncoding;
  /** The message: UTF-8 text, or hex (normalised to lowercase without separators). */
  input: string;
  detail: LegacyDetail;
}

/** The message text: UTF-8 of at most 128 bytes, or hex of 0 … 128 bytes (normalised to lowercase). */
export const readLegacyInput = readSha2Input;

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateLegacyParams(ns: string, params: unknown): ValidationResult<LegacyHashParams> {
  if (typeof params !== 'object' || params === null) return paramError(ns, 'invalidParams');
  const record = params as Record<string, unknown>;
  const encoding = readOption(record['encoding'], LEGACY_ENCODINGS);
  if (encoding === undefined) return paramError(ns, 'encoding', { encoding: String(record['encoding']) });
  const detail = readOption(record['detail'], LEGACY_DETAILS);
  if (detail === undefined) return paramError(ns, 'detail', { detail: String(record['detail']) });
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
