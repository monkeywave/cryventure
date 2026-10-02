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

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
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
