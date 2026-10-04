import { opLabels, readOption, type ParamField, type Preset, type ValidationResult } from '@cryventure/core';
import { HASH_ENCODINGS, paramError, readMessageInput, selectField, type HashEncoding } from '../hashKit/manifestKit.ts';

/**
 * The manifest parts the SHA-2 producers (`sha256`, `sha512`) share: message encodings, detail
 * levels, the recorded op names, param fields, presets and param validation (docs/M5.md §2b–2e).
 * Manifests load eagerly, so this module stays tiny and imports `@cryventure/core` only (and the
 * shared `_lib/hashKit/manifestKit.ts`; the recorder stays behind `load()`).
 */

export const SHA2_ENCODINGS = HASH_ENCODINGS;
export type Sha2Encoding = HashEncoding;
export const SHA2_DETAILS = ['round', 'block'] as const;
export type Sha2Detail = (typeof SHA2_DETAILS)[number];

/**
 * The recorded SHA-2 ops (docs/M5.md §2c, `steps.ts`): `pad` once before block 0; per block `init`,
 * then at `round` detail `schedule t` and `round t`, or at `block` detail one `compress`; then
 * `feedForward`; after the last block `output`.
 */
export const SHA2_OP_NAMES = ['pad', 'init', 'schedule', 'round', 'compress', 'feedForward', 'output'] as const;
export type Sha2OpName = (typeof SHA2_OP_NAMES)[number];

/**
 * At most 128 message bytes (3 SHA-256 or 2 SHA-512 blocks after padding), in either encoding. It is
 * also the text field's `maxLength`: the lab counts hex input as decoded bytes (`encoding: 'hex'`).
 */
export const SHA2_MAX_MESSAGE_BYTES = 128;

/** A SHA-2 producer's params over its own algorithm ids. */
export interface Sha2HashParams<A extends string> {
  algorithm: A;
  encoding: Sha2Encoding;
  /** The message: UTF-8 text, or hex (normalised to lowercase without separators). */
  input: string;
  detail: Sha2Detail;
}

/** The message text: UTF-8 of at most 128 bytes, or hex of 0 … 128 bytes (normalised to lowercase). */
export function readSha2Input(ns: string, input: unknown, encoding: Sha2Encoding): ValidationResult<string> {
  return readMessageInput(ns, input, encoding, SHA2_MAX_MESSAGE_BYTES);
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateSha2Params<A extends string>(ns: string, algorithmIds: readonly A[], params: unknown): ValidationResult<Sha2HashParams<A>> {
  if (typeof params !== 'object' || params === null) return paramError(ns, 'invalidParams');
  const record = params as Record<string, unknown>;
  const algorithm = readOption(record['algorithm'], algorithmIds);
  if (algorithm === undefined) return paramError(ns, 'algorithm', { algorithm: String(record['algorithm']) });
  const encoding = readOption(record['encoding'], SHA2_ENCODINGS);
  if (encoding === undefined) return paramError(ns, 'encoding', { encoding: String(record['encoding']) });
  const detail = readOption(record['detail'], SHA2_DETAILS);
  if (detail === undefined) return paramError(ns, 'detail', { detail: String(record['detail']) });
  const input = readSha2Input(ns, record['input'], encoding);
  if (!input.ok) return input;
  return { ok: true, value: { algorithm, encoding, input: input.value, detail } };
}

/** The param fields of a SHA-2 producer: algorithm, encoding, the message text and the detail level. */
export function sha2ParamFields(ns: string, algorithmIds: readonly string[]): ParamField[] {
  return [
    selectField(ns, 'algorithm', algorithmIds),
    selectField(ns, 'encoding', SHA2_ENCODINGS),
    { name: 'input', kind: 'text', labelKey: `${ns}.param.input`, hintKey: `${ns}.param.inputHint`, maxLength: SHA2_MAX_MESSAGE_BYTES },
    selectField(ns, 'detail', SHA2_DETAILS),
  ];
}

/** The op labels of a SHA-2 producer (`<ns>.op.<name>` for every `SHA2_OP_NAMES` entry). */
export const sha2Ops = (ns: string) => opLabels(ns, SHA2_OP_NAMES);

/** A UTF-8 preset labelled `<ns>.preset.<id>`. */
export function sha2Preset<A extends string>(ns: string, id: string, algorithm: A, input: string, detail: Sha2Detail = 'round'): Preset<Sha2HashParams<A>> {
  return { id, labelKey: `${ns}.preset.${id}`, params: { algorithm, encoding: 'utf8', input, detail } };
}
