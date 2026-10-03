import type { I18nRef } from './i18n.ts';

export type ParseHexResult = { ok: true; bytes: Uint8Array } | { ok: false; error: I18nRef };

export interface ToHexOptions {
  /** Bytes per group; 0 or undefined means no grouping. */
  group?: number;
  /** Separator placed between groups (default `' '`). */
  sep?: string;
}

const SEPARATORS = /[\s:,_-]+/g;
const HEX_PREFIX = /0x/gi;
const HEX_DIGIT = /^[0-9a-fA-F]$/;

function stripDecorations(input: string): string {
  return input.replace(HEX_PREFIX, '').replace(SEPARATORS, '');
}

function findInvalidChar(digits: string): { char: string; index: number } | undefined {
  const chars = [...digits];
  const index = chars.findIndex((char) => !HEX_DIGIT.test(char));
  return index < 0 ? undefined : { char: chars[index] ?? '', index };
}

function decodeHexDigits(digits: string): Uint8Array {
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Tolerant hex parser: ignores whitespace, `:`, `-`, `,`, `_` and `0x` prefixes; any case. */
export function parseHex(input: string): ParseHexResult {
  const digits = stripDecorations(input);
  const invalid = findInvalidChar(digits);
  if (invalid) {
    return { ok: false, error: { key: 'core.error.hexInvalidChar', params: invalid } };
  }
  if (digits.length % 2 !== 0) {
    return { ok: false, error: { key: 'core.error.hexOddLength', params: { length: digits.length } } };
  }
  return { ok: true, bytes: decodeHexDigits(digits) };
}

/** `value` as lowercase hex, zero-padded to at least `digits` digits, e.g. `hexDigits(0x1b, 3)` → `"01b"`. */
export function hexDigits(value: number, digits: number): string {
  return value.toString(16).padStart(digits, '0');
}

/** Two lowercase hex digits of one byte, e.g. `byteToHex(10)` → `"0a"` (expects 0..255). */
export function byteToHex(byte: number): string {
  return hexDigits(byte, 2);
}

/**
 * `parseHex` for input that validation has already accepted: returns the bytes or throws an `Error`
 * whose message carries the `I18nRef` key (a programming error, not user feedback).
 */
export function parseHexOrThrow(input: string): Uint8Array {
  const parsed = parseHex(input);
  if (!parsed.ok) throw new Error(`parseHexOrThrow: ${parsed.error.key} ${JSON.stringify(parsed.error.params ?? {})}`);
  return parsed.bytes;
}

/** `parseHexOrThrow` as a plain `number[]` (for hex that validation has already accepted). */
export function parseHexToArray(input: string): number[] {
  return Array.from(parseHexOrThrow(input));
}

export type HexOfLengthResult = { ok: true; bytes: Uint8Array; hex: string } | { ok: false; error: I18nRef };

/** Message keys `parseHexOfLength` reports with (hex syntax errors keep their `core.error.*` keys). */
export interface HexLengthErrorKeys {
  /** The input is not a string (no params). */
  invalidType: string;
  /** The byte length is not allowed (param `length`, the parsed byte count). */
  wrongLength: string;
}

/**
 * Param validation for one hex field: a string that parses (`parseHex`) to one of `allowedLengths`
 * bytes. On success also returns the normalised lowercase `hex`.
 */
export function parseHexOfLength(input: unknown, allowedLengths: readonly number[], errorKeys: HexLengthErrorKeys): HexOfLengthResult {
  if (typeof input !== 'string') return { ok: false, error: { key: errorKeys.invalidType } };
  const parsed = parseHex(input);
  if (!parsed.ok) return parsed;
  if (!allowedLengths.includes(parsed.bytes.length)) {
    return { ok: false, error: { key: errorKeys.wrongLength, params: { length: parsed.bytes.length } } };
  }
  return { ok: true, bytes: parsed.bytes, hex: toHex(parsed.bytes) };
}

/** Lowercase hex; optionally groups `group` bytes separated by `sep`. */
export function toHex(bytes: ArrayLike<number>, options: ToHexOptions = {}): string {
  const pairs = Array.from(bytes, (byte) => byteToHex(byte & 0xff));
  const { group = 0, sep = ' ' } = options;
  if (group <= 0) return pairs.join('');
  const groups: string[] = [];
  for (let i = 0; i < pairs.length; i += group) groups.push(pairs.slice(i, i + group).join(''));
  return groups.join(sep);
}

export function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** XOR of two equal-length byte arrays; throws on length mismatch (programming error). */
export function xorBytes(a: ArrayLike<number>, b: ArrayLike<number>): Uint8Array {
  if (a.length !== b.length) {
    throw new RangeError(`xorBytes: length mismatch (${a.length} vs ${b.length})`);
  }
  return Uint8Array.from({ length: a.length }, (_, i) => (a[i] ?? 0) ^ (b[i] ?? 0));
}

/**
 * `TextEncoder` exists in every runtime CryVenture targets (browsers, workers,
 * Node ≥ 22); core compiles without the DOM lib, so it is typed locally.
 */
interface TextCodecs {
  TextEncoder: new () => { encode(text: string): Uint8Array };
}
const TEXT_CODECS = globalThis as unknown as TextCodecs;
const UTF8_ENCODER = new TEXT_CODECS.TextEncoder();

/** The UTF-8 encoding of `text`. */
export function utf8Bytes(text: string): Uint8Array {
  return UTF8_ENCODER.encode(text);
}

