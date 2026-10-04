import { i18nRef, opLabels, parseHexOfLength, readOption, utf8Bytes, type ParamField, type ValidationResult } from '@cryventure/core';

/**
 * The eagerly loaded manifest parts of the `blake2` producer (docs/M6.md §2d): the eight RFC 7693 §4
 * function ids, encodings, detail levels, the recorded op names, param fields and validation.
 * Manifests load eagerly, so this module imports `@cryventure/core` only.
 */

/** The eight standard BLAKE2 functions of RFC 7693 §4, `blake2<s|b>-<digest bits>`. */
export const BLAKE2_IDS = ['blake2s-128', 'blake2s-160', 'blake2s-224', 'blake2s-256', 'blake2b-160', 'blake2b-256', 'blake2b-384', 'blake2b-512'] as const;
export type Blake2Id = (typeof BLAKE2_IDS)[number];

/** BLAKE2s (32-bit words) or BLAKE2b (64-bit words). */
export type Blake2Flavour = 'blake2s' | 'blake2b';

export const BLAKE2_ENCODINGS = ['utf8', 'hex'] as const;
export type Blake2Encoding = (typeof BLAKE2_ENCODINGS)[number];

/** `g`: one step per G call; `round`: one step per round; `block`: one step per compression. */
export const BLAKE2_DETAILS = ['g', 'round', 'block'] as const;
export type Blake2Detail = (typeof BLAKE2_DETAILS)[number];

/**
 * The recorded ops: `init` once (h ← IV ⊕ parameter word 0); per block `load` (v ← h ‖ IV, counter
 * and final flag), then `g` (detail `g`), `round` (detail `round`) or `compress` (detail `block`),
 * then `feedForward`; after the last block `output`.
 */
export const BLAKE2_OP_NAMES = ['init', 'load', 'g', 'round', 'compress', 'feedForward', 'output'] as const;
export type Blake2OpName = (typeof BLAKE2_OP_NAMES)[number];

/** At most 128 message bytes in either encoding; also the text field's `maxLength` (hex counts decoded bytes). */
export const BLAKE2_MAX_MESSAGE_BYTES = 128;
const MESSAGE_LENGTHS = Array.from({ length: BLAKE2_MAX_MESSAGE_BYTES + 1 }, (_, length) => length);

/** The longest key of either flavour (BLAKE2b); BLAKE2s allows 32 bytes (RFC 7693 §2.1). */
const MAX_KEY_BYTES: Readonly<Record<Blake2Flavour, number>> = { blake2s: 32, blake2b: 64 };
const KEY_LENGTHS = Array.from({ length: MAX_KEY_BYTES.blake2b + 1 }, (_, length) => length);

/** The flavour of a function id. */
export const blake2Flavour = (id: Blake2Id): Blake2Flavour => (id.startsWith('blake2s') ? 'blake2s' : 'blake2b');

/** Digest bytes of a function id (`blake2s-256` → 32). */
export const blake2OutputBytes = (id: Blake2Id): number => Number(id.slice(id.indexOf('-') + 1)) / 8;

/** The key length limit of a function id: 32 bytes for BLAKE2s, 64 for BLAKE2b. */
export const blake2MaxKeyBytes = (id: Blake2Id): number => MAX_KEY_BYTES[blake2Flavour(id)];

export interface Blake2HashParams {
  algorithm: Blake2Id;
  encoding: Blake2Encoding;
  /** The message: UTF-8 text, or hex (normalised to lowercase without separators). */
  input: string;
  /** The key as hex (normalised); empty = unkeyed. */
  key: string;
  detail: Blake2Detail;
}

type Failure = { ok: false; error: ReturnType<typeof i18nRef> };
const failure = (ns: string, name: string, params?: Record<string, string | number>): Failure => ({ ok: false, error: i18nRef(`${ns}.error.${name}`, params) });

/** The message text: UTF-8 of at most 128 bytes, or hex of 0 … 128 bytes (normalised to lowercase). */
export function readBlake2Input(ns: string, input: unknown, encoding: Blake2Encoding): ValidationResult<string> {
  if (typeof input !== 'string') return failure(ns, 'invalidParams');
  if (encoding === 'hex') {
    const hex = parseHexOfLength(input, MESSAGE_LENGTHS, { invalidType: `${ns}.error.invalidParams`, wrongLength: `${ns}.error.inputLength` });
    return hex.ok ? { ok: true, value: hex.hex } : hex;
  }
  const length = utf8Bytes(input).length;
  return length <= BLAKE2_MAX_MESSAGE_BYTES ? { ok: true, value: input } : failure(ns, 'inputLength', { length });
}

/** The key as hex: 0 … 32 bytes for BLAKE2s, 0 … 64 for BLAKE2b (normalised to lowercase). */
export function readBlake2Key(ns: string, key: unknown, algorithm: Blake2Id): ValidationResult<string> {
  const max = blake2MaxKeyBytes(algorithm);
  const hex = parseHexOfLength(key, KEY_LENGTHS, { invalidType: `${ns}.error.invalidParams`, wrongLength: `${ns}.error.keyLength` });
  if (!hex.ok) return hex.error.key === `${ns}.error.keyLength` ? failure(ns, 'keyLength', { length: Number(hex.error.params?.['length']), max }) : hex;
  return hex.bytes.length <= max ? { ok: true, value: hex.hex } : failure(ns, 'keyLength', { length: hex.bytes.length, max });
}

/** Validates and normalises params (hex lowercased with separators stripped; every select checked). */
export function validateBlake2Params(ns: string, params: unknown): ValidationResult<Blake2HashParams> {
  if (typeof params !== 'object' || params === null) return failure(ns, 'invalidParams');
  const record = params as Record<string, unknown>;
  const algorithm = readOption(record['algorithm'], BLAKE2_IDS);
  if (algorithm === undefined) return failure(ns, 'algorithm', { algorithm: String(record['algorithm']) });
  const encoding = readOption(record['encoding'], BLAKE2_ENCODINGS);
  if (encoding === undefined) return failure(ns, 'encoding', { encoding: String(record['encoding']) });
  const detail = readOption(record['detail'], BLAKE2_DETAILS);
  if (detail === undefined) return failure(ns, 'detail', { detail: String(record['detail']) });
  const input = readBlake2Input(ns, record['input'], encoding);
  if (!input.ok) return input;
  const key = readBlake2Key(ns, record['key'], algorithm);
  if (!key.ok) return key;
  return { ok: true, value: { algorithm, encoding, input: input.value, key: key.value, detail } };
}

function selectField(ns: string, name: string, options: readonly string[]): ParamField {
  return {
    name,
    kind: 'select',
    labelKey: `${ns}.param.${name}`,
    hintKey: `${ns}.param.${name}Hint`,
    options: options.map((value) => ({ value, labelKey: `${ns}.param.${name}Option.${value}` })),
  };
}

/** algorithm, encoding, the message text, the key (hex) and the detail level. */
export function blake2ParamFields(ns: string): ParamField[] {
  return [
    selectField(ns, 'algorithm', BLAKE2_IDS),
    selectField(ns, 'encoding', BLAKE2_ENCODINGS),
    { name: 'input', kind: 'text', labelKey: `${ns}.param.input`, hintKey: `${ns}.param.inputHint`, maxLength: BLAKE2_MAX_MESSAGE_BYTES },
    { name: 'key', kind: 'hex', labelKey: `${ns}.param.key`, hintKey: `${ns}.param.keyHint` },
    selectField(ns, 'detail', BLAKE2_DETAILS),
  ];
}

/** `<ns>.op.<name>` / `<ns>.opShort.<name>` for every recorded op. */
export const blake2Ops = (ns: string) => opLabels(ns, BLAKE2_OP_NAMES);
