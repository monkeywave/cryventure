import { sha2Padding, sha2PadTail, type Sha2Padding } from '../sha2/padding.ts';
import { add32, rotl32, wordsFromBytes, wordsToBytes } from './words.ts';

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

/** MD5 compression of one 64-byte block into `h` (4 words, updated in place and returned). */
export function md5Compress(h: Uint32Array, block: Uint8Array): Uint32Array {
  const x = wordsFromBytes(block.subarray(0, MD5_BLOCK_BYTES), 'little');
  let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!;
  for (let i = 0; i < MD5_ROUNDS; i++) {
    const { fn, k, s } = md5Operation(i);
    const rotated = rotl32(add32(a, MD5_FUNCTIONS[fn](b, c, d), x[k]!, MD5_T[i]!), s);
    a = d;
    d = c;
    c = b;
    b = add32(b, rotated);
  }
  h[0]! += a;
  h[1]! += b;
  h[2]! += c;
  h[3]! += d;
  return h;
}

/** The 16 digest bytes of the state: A, B, C, D little-endian (RFC 1321 §3.5). */
export function md5StateBytes(h: Uint32Array): Uint8Array {
  return Uint8Array.from(wordsToBytes([...h], 'little'));
}

/** The MD5 digest of `data`. */
export function md5Digest(data: Uint8Array): Uint8Array {
  const h = Uint32Array.from(MD5_IV);
  const padded = md5Padding(data).padded;
  for (let offset = 0; offset < padded.length; offset += MD5_BLOCK_BYTES) md5Compress(h, padded.subarray(offset, offset + MD5_BLOCK_BYTES));
  return md5StateBytes(h);
}
