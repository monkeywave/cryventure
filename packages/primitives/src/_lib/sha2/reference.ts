import { SHA256_K, SHA512_K } from './constants.ts';

/**
 * The untraced SHA-2 compression functions (FIPS 180-4 §6.2.2, §6.4.2), written independently of
 * the traced building blocks (`words.ts`, `functions.ts`, `compress.ts`) so the producers can check
 * their traces against them (docs/M5.md §2a). Each updates `h` in place and returns it.
 */

const rotr32 = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

function schedule256(block: Uint8Array): Uint32Array {
  const w = new Uint32Array(64);
  const view = new DataView(block.buffer, block.byteOffset, 64);
  for (let t = 0; t < 16; t++) w[t] = view.getUint32(t * 4);
  for (let t = 16; t < 64; t++) {
    const x = w[t - 15]!;
    const y = w[t - 2]!;
    const s0 = rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3);
    const s1 = rotr32(y, 17) ^ rotr32(y, 19) ^ (y >>> 10);
    w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
  }
  return w;
}

/** SHA-224/256 compression of one 64-byte block into `h` (8 words). */
export function sha256Compress(h: Uint32Array, block: Uint8Array): Uint32Array {
  const w = schedule256(block);
  let [a, b, c, d, e, f, g, hh] = Array.from(h) as [number, number, number, number, number, number, number, number];
  for (let t = 0; t < 64; t++) {
    const t1 = (hh + (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[t]! + w[t]!) >>> 0;
    const t2 = ((rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
  }
  [a, b, c, d, e, f, g, hh].forEach((word, index) => (h[index] = (h[index]! + word) >>> 0));
  return h;
}

const MASK64 = 0xffffffffffffffffn;
const rotr64 = (x: bigint, n: bigint): bigint => ((x >> n) | (x << (64n - n))) & MASK64;

function schedule512(block: Uint8Array): BigUint64Array {
  const w = new BigUint64Array(80);
  const view = new DataView(block.buffer, block.byteOffset, 128);
  for (let t = 0; t < 16; t++) w[t] = view.getBigUint64(t * 8);
  for (let t = 16; t < 80; t++) {
    const x = w[t - 15]!;
    const y = w[t - 2]!;
    const s0 = rotr64(x, 1n) ^ rotr64(x, 8n) ^ (x >> 7n);
    const s1 = rotr64(y, 19n) ^ rotr64(y, 61n) ^ (y >> 6n);
    w[t] = w[t - 16]! + s0 + w[t - 7]! + s1;
  }
  return w;
}

/** SHA-384/512/512-t compression of one 128-byte block into `h` (8 words; BigUint64Array wraps mod 2^64). */
export function sha512Compress(h: BigUint64Array, block: Uint8Array): BigUint64Array {
  const w = schedule512(block);
  let [a, b, c, d, e, f, g, hh] = Array.from(h) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  for (let t = 0; t < 80; t++) {
    const t1 = (hh + (rotr64(e, 14n) ^ rotr64(e, 18n) ^ rotr64(e, 41n)) + ((e & f) ^ (~e & MASK64 & g)) + SHA512_K[t]! + w[t]!) & MASK64;
    const t2 = ((rotr64(a, 28n) ^ rotr64(a, 34n) ^ rotr64(a, 39n)) + ((a & b) ^ (a & c) ^ (b & c))) & MASK64;
    [hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) & MASK64, c, b, a, (t1 + t2) & MASK64];
  }
  [a, b, c, d, e, f, g, hh].forEach((word, index) => (h[index] = h[index]! + word));
  return h;
}
