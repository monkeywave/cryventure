import { i18nRef, parseHexOfLength, utf8Bytes, type ParamField, type ValidationResult } from '@cryventure/core';

/**
 * The manifest parts every hash producer kit shares (`_lib/{sha2,keccak,blake2,legacy-md}/manifestKit.ts`):
 * the message encodings, select fields, namespaced param errors and the message reader. Manifests
 * load eagerly, so this module imports `@cryventure/core` only.
 */

export const HASH_ENCODINGS = ['utf8', 'hex'] as const;
export type HashEncoding = (typeof HASH_ENCODINGS)[number];

/** A failed validation with the message `<ns>.error.<name>`. */
export const paramError = (ns: string, name: string, params?: Record<string, string | number>) => ({ ok: false as const, error: i18nRef(`${ns}.error.${name}`, params) });

/** A select field `name` over `options`, labelled under `<ns>.param.<name>…`. */
export function selectField(ns: string, name: string, options: readonly string[]): ParamField {
  return {
    name,
    kind: 'select',
    labelKey: `${ns}.param.${name}`,
    hintKey: `${ns}.param.${name}Hint`,
    options: options.map((value) => ({ value, labelKey: `${ns}.param.${name}Option.${value}` })),
  };
}

/** The admissible byte lengths 0 … maxBytes. */
export const messageLengths = (maxBytes: number): number[] => Array.from({ length: maxBytes + 1 }, (_, length) => length);

/** The message text: UTF-8 of at most `maxBytes` bytes, or hex of 0 … `maxBytes` bytes (normalised to lowercase). */
export function readMessageInput(ns: string, input: unknown, encoding: HashEncoding, maxBytes: number): ValidationResult<string> {
  if (typeof input !== 'string') return paramError(ns, 'invalidParams');
  if (encoding === 'hex') {
    const hex = parseHexOfLength(input, messageLengths(maxBytes), { invalidType: `${ns}.error.invalidParams`, wrongLength: `${ns}.error.inputLength` });
    return hex.ok ? { ok: true, value: hex.hex } : hex;
  }
  const length = utf8Bytes(input).length;
  return length <= maxBytes ? { ok: true, value: input } : paramError(ns, 'inputLength', { length });
}
