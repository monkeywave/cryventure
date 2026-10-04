import { i18nRef, parseHexOfLength, readPortMemberRef, type ParamField, type ValidationResult } from '@cryventure/core';

/**
 * The manifest parts both TLS PRF producers share (docs/M7.md §2f): the secret, label, seed and
 * length fields, their limits and validation, and the HMAC member fields. Manifests load eagerly,
 * so this module imports `@cryventure/core` only.
 */

/** Byte limits of the PRF inputs (docs/M7.md §2f); an HMAC call's key and message then fit the `hmac` lab (≤ 256 bytes each). */
export const PRF_LIMITS = {
  secretBytes: 256,
  labelBytes: 64,
  seedBytes: 128,
  outputBytes: 256,
} as const;

/** The inputs every TLS PRF takes: hex secret and seed, an ASCII label and the output length in bytes (decimal text). */
export interface PrfInputs {
  secret: string;
  label: string;
  seed: string;
  length: string;
}

/** Printable ASCII (RFC 5246 §5: "an ASCII string"), at least one character. */
const ASCII_LABEL = /^[\x20-\x7e]+$/;
const DECIMAL = /^[0-9]{1,3}$/;
/** Enough digits for `PRF_LIMITS.outputBytes`. */
const LENGTH_DIGITS = 3;

const lengths = (min: number, max: number): number[] => Array.from({ length: max - min + 1 }, (_, index) => min + index);

/** A failed validation with the message `<ns>.error.<name>`. */
const prfError = (ns: string, name: string) => ({ ok: false as const, error: i18nRef(`${ns}.error.${name}`) });

/** A `Mac` member field `name` limited to HMAC (a TLS PRF is defined over HMAC only), labelled `<ns>.param.<name>`. */
export function hmacMemberField(ns: string, name: string): ParamField {
  return { name, kind: 'port', port: 'Mac', member: true, constructions: ['hmac'], labelKey: `${ns}.param.${name}`, hintKey: `${ns}.param.${name}Hint` };
}

/** The secret, label, seed and length fields, labelled `<ns>.param.<name>` with a `<name>Hint`. */
export function prfInputFields(ns: string): ParamField[] {
  const field = (name: keyof PrfInputs, kind: ParamField['kind'], maxLength?: number): ParamField => ({
    name,
    kind,
    labelKey: `${ns}.param.${name}`,
    hintKey: `${ns}.param.${name}Hint`,
    ...(maxLength === undefined ? {} : { maxLength }),
  });
  return [field('secret', 'hex'), field('label', 'text', PRF_LIMITS.labelBytes), field('seed', 'hex'), field('length', 'text', LENGTH_DIGITS)];
}

/** Hex of `min` … `max` bytes, normalised; `<ns>.error.<name>Length` names the byte count. */
function readHexInput(ns: string, input: unknown, name: string, min: number, max: number): ValidationResult<string> {
  const hex = parseHexOfLength(input, lengths(min, max), { invalidType: `${ns}.error.invalidParams`, wrongLength: `${ns}.error.${name}Length` });
  return hex.ok ? { ok: true, value: hex.hex } : hex;
}

/** The output length: 1 … `PRF_LIMITS.outputBytes` as decimal digits, normalised (no leading zeros). */
export function readOutputLength(ns: string, input: unknown): ValidationResult<string> {
  if (typeof input !== 'string' || !DECIMAL.test(input.trim())) return prfError(ns, 'length');
  const length = Number(input.trim());
  return length >= 1 && length <= PRF_LIMITS.outputBytes ? { ok: true, value: String(length) } : prfError(ns, 'length');
}

/** The label: 1 … `PRF_LIMITS.labelBytes` printable ASCII characters. */
export function readLabel(ns: string, input: unknown): ValidationResult<string> {
  return typeof input === 'string' && input.length <= PRF_LIMITS.labelBytes && ASCII_LABEL.test(input) ? { ok: true, value: input } : prfError(ns, 'label');
}

/** A member ref of an HMAC field; existence and construction are checked at run time. */
export function readMacRef(ns: string, input: unknown, name: string): ValidationResult<string> {
  const ref = readPortMemberRef(input);
  return ref === undefined ? prfError(ns, name) : { ok: true, value: ref };
}

/** Validates and normalises the shared PRF inputs of `record` (secret 1 … 256 bytes, seed 0 … 128 bytes). */
export function readPrfInputs(ns: string, record: Record<string, unknown>): ValidationResult<PrfInputs> {
  const secret = readHexInput(ns, record['secret'], 'secret', 1, PRF_LIMITS.secretBytes);
  if (!secret.ok) return secret;
  const label = readLabel(ns, record['label']);
  if (!label.ok) return label;
  const seed = readHexInput(ns, record['seed'], 'seed', 0, PRF_LIMITS.seedBytes);
  if (!seed.ok) return seed;
  const length = readOutputLength(ns, record['length']);
  if (!length.ok) return length;
  return { ok: true, value: { secret: secret.value, label: label.value, seed: seed.value, length: length.value } };
}

/** The params object of a manifest's `validate()`, or the `<ns>.error.invalidParams` failure. */
export function readParamsRecord(ns: string, params: unknown): ValidationResult<Record<string, unknown>> {
  return typeof params === 'object' && params !== null ? { ok: true, value: params as Record<string, unknown> } : prfError(ns, 'invalidParams');
}
