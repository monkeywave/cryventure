/**
 * 32-bit word arithmetic for MD5 (RFC 1321) and SHA-1 (FIPS 180-4 §6.1). Words are `number`s in
 * 0 … 2^32 − 1; the two hashes differ only in how a word maps to bytes: MD5 is little-endian
 * (RFC 1321 §2), SHA-1 big-endian (FIPS 180-4 §3.1).
 */
export type WordByteOrder = 'big' | 'little';

const WORD_BYTES = 4;

/** Sum modulo 2^32. */
export function add32(...words: number[]): number {
  return words.reduce((sum, word) => (sum + word) >>> 0, 0);
}

/** Left rotation by `n` bits, 0 ≤ n < 32 (RFC 1321 `<<<`, FIPS 180-4 ROTL^n). */
export function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/** Exactly eight lowercase hex digits of the word's integer value. */
export function hex32(word: number): string {
  return (word >>> 0).toString(16).padStart(8, '0');
}

/** The words as hex, separated by `separator` (default a space). */
export function wordsHex(words: readonly number[], separator = ' '): string {
  return words.map(hex32).join(separator);
}

/** The word's four bytes in `order`. */
export function wordToBytes(word: number, order: WordByteOrder): number[] {
  const big = [word >>> 24, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff];
  return order === 'big' ? big : big.reverse();
}

/** The bytes of `words` in `order`, concatenated. */
export function wordsToBytes(words: readonly number[], order: WordByteOrder): number[] {
  return words.flatMap((word) => wordToBytes(word, order));
}

/** The words of `bytes` (its length a multiple of 4) in `order`. */
export function wordsFromBytes(bytes: ArrayLike<number>, order: WordByteOrder): number[] {
  return Array.from({ length: Math.floor(bytes.length / WORD_BYTES) }, (_, index) => {
    const at = (offset: number) => bytes[index * WORD_BYTES + (order === 'big' ? offset : 3 - offset)] ?? 0;
    return ((at(0) << 24) | (at(1) << 16) | (at(2) << 8) | at(3)) >>> 0;
  });
}
