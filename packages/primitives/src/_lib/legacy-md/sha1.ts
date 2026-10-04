import { compressBlocks } from '../sha2/context.ts';
import { sha2Padding, sha2PadTail, type Sha2Padding } from '../sha2/padding.ts';
import { WORD32, wordsFromBytes, wordsToBytes } from '../sha2/words.ts';

/**
 * SHA-1 (FIPS 180-4 §6.1), untraced: the constants, f_t, the message schedule and the reference
 * compression function. The padding is SHA-2's (§5.1.1, 64-byte blocks); the traced producer
 * (`sha1Detail.ts`) checks its trace against `sha1Digest`.
 */

export const SHA1_BLOCK_BYTES = 64;
export const SHA1_OUTPUT_BYTES = 20;
export const SHA1_ROUNDS = 80;

/** H(0) (FIPS 180-4 §5.3.1). */
export const SHA1_IV: readonly number[] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

/** K for t = 0–19, 20–39, 40–59, 60–79 (§4.2.1): ⌊2^30 · √2⌋, √3, √5, √10; `sha1.test.ts` recomputes them. */
export const SHA1_K: readonly number[] = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];

/** f_t (§4.1.1): Ch for t = 0–19, Parity for 20–39 and 60–79, Maj for 40–59. */
export type Sha1FunctionName = 'ch' | 'parity' | 'maj';
const FUNCTION_NAMES: readonly Sha1FunctionName[] = ['ch', 'parity', 'maj', 'parity'];

export const SHA1_FUNCTIONS: Readonly<Record<Sha1FunctionName, (x: number, y: number, z: number) => number>> = {
  ch: (x, y, z) => ((x & y) ^ (~x & z)) >>> 0,
  parity: (x, y, z) => (x ^ y ^ z) >>> 0,
  maj: (x, y, z) => ((x & y) ^ (x & z) ^ (y & z)) >>> 0,
};

/** The function and constant of round t (0 … 79). */
export function sha1RoundConstants(t: number): { fn: Sha1FunctionName; k: number } {
  if (!Number.isInteger(t) || t < 0 || t >= SHA1_ROUNDS) throw new RangeError(`sha1RoundConstants: t must be 0 … 79 (got ${t})`);
  const quarter = Math.floor(t / 20);
  return { fn: FUNCTION_NAMES[quarter]!, k: SHA1_K[quarter]! };
}

/** W_t = ROTL^1(W_{t−3} ⊕ W_{t−8} ⊕ W_{t−14} ⊕ W_{t−16}) for t ≥ 16, given W_0 … W_{t−1}. */
export function sha1ScheduleWord(w: readonly number[], t: number): number {
  return WORD32.rotl((w[t - 3]! ^ w[t - 8]! ^ w[t - 14]! ^ w[t - 16]!) >>> 0, 1);
}

/** The 80 schedule words of one 64-byte block (§6.1.2 step 1). */
export function sha1Schedule(block: Uint8Array): number[] {
  const w = wordsFromBytes(WORD32, block.subarray(0, SHA1_BLOCK_BYTES), 'big');
  for (let t = 16; t < SHA1_ROUNDS; t++) w.push(sha1ScheduleWord(w, t));
  return w;
}

/** W_0 … W_79 of the block being compressed (reused: compression is synchronous). */
const W = new Int32Array(SHA1_ROUNDS);
const K_TABLE = Int32Array.from(SHA1_K);

/** The schedule (§6.1.2 step 1) into `w`: W_0 … W_15 big-endian, then the ROTL^1 recurrence. */
function fillSchedule(block: Uint8Array, w: Int32Array): void {
  for (let t = 0, o = 0; t < 16; t++, o += 4) w[t] = (block[o]! << 24) | (block[o + 1]! << 16) | (block[o + 2]! << 8) | block[o + 3]!;
  for (let t = 16; t < SHA1_ROUNDS; t++) {
    const x = w[t - 3]! ^ w[t - 8]! ^ w[t - 14]! ^ w[t - 16]!;
    w[t] = (x << 1) | (x >>> 31);
  }
}

/** f_t(b, c, d) + K_t (§4.1.1, §4.2.1) as a signed 32-bit int: Ch, Parity, Maj, Parity by quarter. */
function fPlusK(t: number, b: number, c: number, d: number): number {
  if (t < 20) return (((b & c) ^ (~b & d)) + K_TABLE[0]!) | 0;
  if (t < 40) return ((b ^ c ^ d) + K_TABLE[1]!) | 0;
  if (t < 60) return (((b & c) ^ (b & d) ^ (c & d)) + K_TABLE[2]!) | 0;
  return ((b ^ c ^ d) + K_TABLE[3]!) | 0;
}

/**
 * SHA-1 compression of one 64-byte block into `h` (5 words, updated in place and returned): the
 * port's hot path (docs/M7.md §2e), int32 arithmetic on a reused schedule; equal to `sha1CompressSpec`.
 */
export function sha1Compress(h: Uint32Array, block: Uint8Array): Uint32Array {
  fillSchedule(block, W);
  let a = h[0]! | 0, b = h[1]! | 0, c = h[2]! | 0, d = h[3]! | 0, e = h[4]! | 0;
  for (let t = 0; t < SHA1_ROUNDS; t++) {
    const temp = (((a << 5) | (a >>> 27)) + fPlusK(t, b, c, d) + e + W[t]!) | 0;
    e = d;
    d = c;
    c = (b << 30) | (b >>> 2);
    b = a;
    a = temp;
  }
  // Uint32Array stores wrap mod 2^32 (negative int32 sums included).
  h[0]! += a;
  h[1]! += b;
  h[2]! += c;
  h[3]! += d;
  h[4]! += e;
  return h;
}

/**
 * SHA-1 compression written straight from FIPS 180-4 §6.1.2 (`sha1Schedule`, `sha1RoundConstants`,
 * `SHA1_FUNCTIONS`, `WORD32`): the readable reference `sha1Compress` is checked and timed against
 * (about 10 µs per block).
 */
export function sha1CompressSpec(h: Uint32Array, block: Uint8Array): Uint32Array {
  const w = sha1Schedule(block);
  let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!;
  for (let t = 0; t < SHA1_ROUNDS; t++) {
    const { fn, k } = sha1RoundConstants(t);
    const T = WORD32.add(WORD32.rotl(a, 5), SHA1_FUNCTIONS[fn](b, c, d), e, k, w[t]!);
    e = d;
    d = c;
    c = WORD32.rotl(b, 30);
    b = a;
    a = T;
  }
  h[0]! += a;
  h[1]! += b;
  h[2]! += c;
  h[3]! += d;
  h[4]! += e;
  return h;
}

/** The SHA-1 padding (FIPS 180-4 §5.1.1, shared with SHA-224/256). */
export function sha1Padding(message: ArrayLike<number>): Sha2Padding {
  return sha2Padding(message, SHA1_BLOCK_BYTES);
}

/** The final block(s) of an incremental computation. */
export function sha1PadTail(tail: ArrayLike<number>, messageBytes: number): Uint8Array {
  return sha2PadTail(tail, messageBytes, SHA1_BLOCK_BYTES);
}

/** The 20 digest bytes of the state, big-endian (§6.1.2). */
export function sha1StateBytes(h: Uint32Array): Uint8Array {
  return Uint8Array.from(wordsToBytes(WORD32, [...h], 'big'));
}

/** The SHA-1 digest of `data`. */
export function sha1Digest(data: Uint8Array): Uint8Array {
  return sha1StateBytes(compressBlocks(Uint32Array.from(SHA1_IV), sha1Padding(data).padded, SHA1_BLOCK_BYTES, sha1Compress));
}
