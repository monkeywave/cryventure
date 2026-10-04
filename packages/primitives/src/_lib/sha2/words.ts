/**
 * Word arithmetic for SHA-2, generic over the word size (docs/M5.md §2a): 32-bit words as `number`
 * (SHA-224/256) and 64-bit words as `bigint` (SHA-384/512/512-t), so 64-bit values never pass
 * through `number`. Words map to bytes and hex big-endian, as FIPS 180-4 writes them (§3.1).
 */
export type Word = number | bigint;

export interface WordArith<W extends Word> {
  readonly bits: 32 | 64;
  /** Bytes per word: 4 or 8. */
  readonly bytes: 4 | 8;
  /** Sum modulo 2^bits. */
  add(...words: W[]): W;
  xor(a: W, b: W): W;
  and(a: W, b: W): W;
  not(a: W): W;
  /** ROTR^n(x) (§3.2). */
  rotr(x: W, n: number): W;
  /** SHR^n(x) (§3.2). */
  shr(x: W, n: number): W;
  /** The word stored big-endian at `bytes[offset …]`. */
  fromBytes(bytes: ArrayLike<number>, offset: number): W;
  /** The word's big-endian bytes. */
  toBytes(word: W): number[];
  /** Exactly bits / 4 lowercase hex digits. */
  toHex(word: W): string;
}

export const WORD32: WordArith<number> = {
  bits: 32,
  bytes: 4,
  add: (...words) => words.reduce((sum, word) => (sum + word) >>> 0, 0),
  xor: (a, b) => (a ^ b) >>> 0,
  and: (a, b) => (a & b) >>> 0,
  not: (a) => ~a >>> 0,
  rotr: (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0,
  shr: (x, n) => x >>> n,
  fromBytes: (bytes, offset) => (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0,
  toBytes: (word) => [word >>> 24, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff],
  toHex: (word) => word.toString(16).padStart(8, '0'),
};

const MASK64 = (1n << 64n) - 1n;

function bigFromBytes(bytes: ArrayLike<number>, offset: number): bigint {
  let word = 0n;
  for (let index = 0; index < 8; index++) word = (word << 8n) | BigInt(bytes[offset + index] ?? 0);
  return word;
}

export const WORD64: WordArith<bigint> = {
  bits: 64,
  bytes: 8,
  add: (...words) => words.reduce((sum, word) => (sum + word) & MASK64, 0n),
  xor: (a, b) => a ^ b,
  and: (a, b) => a & b,
  not: (a) => a ^ MASK64,
  rotr: (x, n) => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & MASK64,
  shr: (x, n) => x >> BigInt(n),
  fromBytes: bigFromBytes,
  toBytes: (word) => Array.from({ length: 8 }, (_, index) => Number((word >> BigInt(56 - 8 * index)) & 0xffn)),
  toHex: (word) => word.toString(16).padStart(16, '0'),
};

/** The big-endian words of `bytes` (its length a multiple of the word size). */
export function wordsFromBytes<W extends Word>(arith: WordArith<W>, bytes: ArrayLike<number>): W[] {
  return Array.from({ length: Math.floor(bytes.length / arith.bytes) }, (_, index) => arith.fromBytes(bytes, index * arith.bytes));
}

/** The big-endian bytes of `words`, concatenated. */
export function wordsToBytes<W extends Word>(arith: WordArith<W>, words: readonly W[]): number[] {
  return words.flatMap((word) => arith.toBytes(word));
}

/** The words as hex, separated by `separator` (default a space), e.g. "6a09e667 bb67ae85". */
export function wordsHex<W extends Word>(arith: WordArith<W>, words: readonly W[], separator = ' '): string {
  return words.map((word) => arith.toHex(word)).join(separator);
}
