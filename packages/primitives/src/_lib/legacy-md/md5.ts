import { compressBlocks } from '../sha2/context.ts';
import { sha2Padding, sha2PadTail, type Sha2Padding } from '../sha2/padding.ts';
import { WORD32, wordsFromBytes, wordsToBytes } from '../sha2/words.ts';

/**
 * MD5 (RFC 1321), untraced: the constants, the four auxiliary functions, the padding with its
 * little-endian length and the reference compression function. The traced producer
 * (`md5Detail.ts`) checks its trace against `md5Digest`.
 */

export const MD5_BLOCK_BYTES = 64;
export const MD5_OUTPUT_BYTES = 16;
export const MD5_ROUNDS = 64;

/** A, B, C, D (RFC 1321 §3.3: the bytes 01 23 45 67, 89 ab cd ef, … read little-endian). */
export const MD5_IV: readonly number[] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

/**
 * T[1 … 64] as printed in RFC 1321 §3.4 / A.3, at index i − 1. RFC 1321 defines
 * T[i] = ⌊2^32 · |sin(i)|⌋ (i in radians); `md5.test.ts` recomputes them.
 */
export const MD5_T: readonly number[] = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

/** The rotation amounts s of each round (RFC 1321 §3.4), four per round, used cyclically. */
const SHIFTS: readonly (readonly number[])[] = [
  [7, 12, 17, 22],
  [5, 9, 14, 20],
  [4, 11, 16, 23],
  [6, 10, 15, 21],
];

/** The auxiliary function of a round: F, G, H, I (RFC 1321 §3.4). */
export type Md5FunctionName = 'F' | 'G' | 'H' | 'I';
const FUNCTION_NAMES: readonly Md5FunctionName[] = ['F', 'G', 'H', 'I'];

/** F(X,Y,Z) = XY ∨ ¬X Z; G = XZ ∨ Y ¬Z; H = X ⊕ Y ⊕ Z; I = Y ⊕ (X ∨ ¬Z). */
export const MD5_FUNCTIONS: Readonly<Record<Md5FunctionName, (x: number, y: number, z: number) => number>> = {
  F: (x, y, z) => ((x & y) | (~x & z)) >>> 0,
  G: (x, y, z) => ((x & z) | (y & ~z)) >>> 0,
  H: (x, y, z) => (x ^ y ^ z) >>> 0,
  I: (x, y, z) => (y ^ (x | ~z)) >>> 0,
};

/** What operation i (0 … 63) uses: the round (0 … 3), its function, the word index k and the shift s. */
export interface Md5Operation {
  round: number;
  fn: Md5FunctionName;
  k: number;
  s: number;
}

/** k = i, 1 + 5i, 5 + 3i, 7i (mod 16) in rounds 1 … 4 (RFC 1321 §3.4). */
const WORD_INDEX: readonly ((i: number) => number)[] = [(i) => i, (i) => 1 + 5 * i, (i) => 5 + 3 * i, (i) => 7 * i];

export function md5Operation(i: number): Md5Operation {
  if (!Number.isInteger(i) || i < 0 || i >= MD5_ROUNDS) throw new RangeError(`md5Operation: i must be 0 … 63 (got ${i})`);
  const round = Math.floor(i / 16);
  return { round, fn: FUNCTION_NAMES[round]!, k: WORD_INDEX[round]!(i) % 16, s: SHIFTS[round]![i % 4]! };
}

/** The MD5 padding: SHA-2's §5.1.1 padding with the 64-bit length little-endian (RFC 1321 §3.1–3.2). */
export function md5Padding(message: ArrayLike<number>): Sha2Padding {
  const padding = sha2Padding(message, MD5_BLOCK_BYTES);
  littleEndianLength(padding.padded);
  return padding;
}

/** Turns the big-endian length field at the end of `padded` into little-endian, in place. */
function littleEndianLength(padded: Uint8Array): Uint8Array {
  padded.subarray(padded.length - 8).reverse();
  return padded;
}

/** The final block(s) of an incremental computation (the tail padded with the whole message's length). */
export function md5PadTail(tail: ArrayLike<number>, messageBytes: number): Uint8Array {
  return littleEndianLength(sha2PadTail(tail, messageBytes, MD5_BLOCK_BYTES));
}

/** k and s of operation i (`md5Operation`) as flat tables, so the fast compression allocates nothing per step. */
const WORD_INDEX_TABLE = Uint8Array.from({ length: MD5_ROUNDS }, (_, i) => md5Operation(i).k);
const SHIFT_TABLE = Uint8Array.from({ length: MD5_ROUNDS }, (_, i) => md5Operation(i).s);
const T_TABLE = Int32Array.from(MD5_T);
/** X[0 … 15] of the block being compressed (reused: compression is synchronous). */
const X = new Int32Array(16);

/** X[0 … 15]: the block's 32-bit words read little-endian (RFC 1321 §3.4). */
function readLittleEndianWords(block: Uint8Array, x: Int32Array): void {
  for (let j = 0, o = 0; j < 16; j++, o += 4) x[j] = block[o]! | (block[o + 1]! << 8) | (block[o + 2]! << 16) | (block[o + 3]! << 24);
}

/** The auxiliary function of operation i on b, c, d (F, G, H, I by quarter), as a signed 32-bit int. */
function md5Function(i: number, b: number, c: number, d: number): number {
  if (i < 16) return (b & c) | (~b & d);
  if (i < 32) return (b & d) | (c & ~d);
  if (i < 48) return b ^ c ^ d;
  return c ^ (b | ~d);
}

/**
 * MD5 compression of one 64-byte block into `h` (4 words, updated in place and returned): the
 * port's hot path (docs/M7.md §2e), int32 arithmetic on flat tables; equal to `md5CompressSpec`.
 */
export function md5Compress(h: Uint32Array, block: Uint8Array): Uint32Array {
  readLittleEndianWords(block, X);
  let a = h[0]! | 0, b = h[1]! | 0, c = h[2]! | 0, d = h[3]! | 0;
  for (let i = 0; i < MD5_ROUNDS; i++) {
    const sum = (a + md5Function(i, b, c, d) + X[WORD_INDEX_TABLE[i]!]! + T_TABLE[i]!) | 0;
    const s = SHIFT_TABLE[i]!;
    a = d;
    d = c;
    c = b;
    b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
  }
  // Uint32Array stores wrap mod 2^32 (negative int32 sums included).
  h[0]! += a;
  h[1]! += b;
  h[2]! += c;
  h[3]! += d;
  return h;
}

/**
 * MD5 compression written straight from RFC 1321 §3.4 (`md5Operation`, `MD5_FUNCTIONS`, `WORD32`):
 * the readable reference `md5Compress` is checked and timed against (about 12 µs per block).
 */
export function md5CompressSpec(h: Uint32Array, block: Uint8Array): Uint32Array {
  const x = wordsFromBytes(WORD32, block.subarray(0, MD5_BLOCK_BYTES), 'little');
  let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!;
  for (let i = 0; i < MD5_ROUNDS; i++) {
    const { fn, k, s } = md5Operation(i);
    const rotated = WORD32.rotl(WORD32.add(a, MD5_FUNCTIONS[fn](b, c, d), x[k]!, MD5_T[i]!), s);
    a = d;
    d = c;
    c = b;
    b = WORD32.add(b, rotated);
  }
  h[0]! += a;
  h[1]! += b;
  h[2]! += c;
  h[3]! += d;
  return h;
}

/** The 16 digest bytes of the state: A, B, C, D little-endian (RFC 1321 §3.5). */
export function md5StateBytes(h: Uint32Array): Uint8Array {
  return Uint8Array.from(wordsToBytes(WORD32, [...h], 'little'));
}

/** The MD5 digest of `data`. */
export function md5Digest(data: Uint8Array): Uint8Array {
  return md5StateBytes(compressBlocks(Uint32Array.from(MD5_IV), md5Padding(data).padded, MD5_BLOCK_BYTES, md5Compress));
}
