import { SHA512_K } from './constants.ts';

/**
 * SHA-384/512/512-t compression on 32-bit hi/lo word pairs (docs/M7.md §2a): the same function as
 * `sha512Compress` (FIPS 180-4 §6.4.2) without `bigint`, for the `Hash` port's functions and
 * contexts only. The traced producers and `sha2Digest` keep the `bigint` reference.
 *
 * 64-bit word i of a hi/lo array is (`hl[2i]`, `hl[2i + 1]`) = (high, low) 32 bits, so the array
 * written as big-endian 32-bit words is the 64-bit words in FIPS 180-4 byte order.
 */

const TWO32 = 0x100000000;

/** 64-bit words as hi/lo `Uint32Array` entries (twice as many). */
export function toHiLo(words: ArrayLike<bigint>): Uint32Array {
  const hl = new Uint32Array(words.length * 2);
  for (let i = 0; i < words.length; i++) {
    hl[2 * i] = Number(words[i]! >> 32n);
    hl[2 * i + 1] = Number(words[i]! & 0xffffffffn);
  }
  return hl;
}

/** The 64-bit words of a hi/lo array. Test reference: only the tests use it, to compare with the `bigint` compression. */
export function fromHiLo(hl: Uint32Array): bigint[] {
  return Array.from({ length: hl.length / 2 }, (_, i) => (BigInt(hl[2 * i]!) << 32n) | BigInt(hl[2 * i + 1]!));
}

const K = toHiLo(SHA512_K);

/** W_0 … W_79 as hi/lo pairs, reused between calls (the compression is synchronous). */
const W = new Uint32Array(160);

/*
 * ROTR^n / SHR^n of the pair (h, l) for 0 < n < 32, high and low halves separately. ROTR^n for
 * 32 < n < 64 is ROTR^(n−32) with the halves swapped: high = rotrLo(n − 32), low = rotrHi(n − 32).
 */
const rotrHi = (h: number, l: number, n: number): number => (h >>> n) | (l << (32 - n));
const rotrLo = (h: number, l: number, n: number): number => (l >>> n) | (h << (32 - n));

function schedule(block: Uint8Array): void {
  const view = new DataView(block.buffer, block.byteOffset, 128);
  for (let i = 0; i < 32; i++) W[i] = view.getUint32(i * 4);
  for (let i = 32; i < 160; i += 2) {
    const xh = W[i - 30]!, xl = W[i - 29]!; // W_{t−15}
    const yh = W[i - 4]!, yl = W[i - 3]!; // W_{t−2}
    // σ0 = ROTR^1 ⊕ ROTR^8 ⊕ SHR^7; σ1 = ROTR^19 ⊕ ROTR^61 ⊕ SHR^6.
    const s0h = rotrHi(xh, xl, 1) ^ rotrHi(xh, xl, 8) ^ (xh >>> 7);
    const s0l = rotrLo(xh, xl, 1) ^ rotrLo(xh, xl, 8) ^ rotrLo(xh, xl, 7);
    const s1h = rotrHi(yh, yl, 19) ^ rotrLo(yh, yl, 29) ^ (yh >>> 6);
    const s1l = rotrLo(yh, yl, 19) ^ rotrHi(yh, yl, 29) ^ rotrLo(yh, yl, 6);
    const lo = W[i - 31]! + (s0l >>> 0) + W[i - 13]! + (s1l >>> 0);
    W[i] = W[i - 32]! + s0h + W[i - 14]! + s1h + Math.floor(lo / TWO32);
    W[i + 1] = lo;
  }
}

/** H^(i) = H^(i−1) + (a, …, h) word-wise mod 2^64, `vars` as hi/lo pairs (Uint32Array stores wrap mod 2^32). */
function addVars(hl: Uint32Array, vars: readonly number[]): void {
  for (let i = 0; i < 16; i += 2) {
    const lo = hl[i + 1]! + (vars[i + 1]! >>> 0);
    hl[i] = hl[i]! + vars[i]! + Math.floor(lo / TWO32);
    hl[i + 1] = lo;
  }
}

/**
 * SHA-384/512/512-t compression of one 128-byte block into `hl` (16 hi/lo entries) in place; returns it.
 * Deliberately one long function: it is the hot path of the `Hash` port (PBKDF2-HMAC runs it twice per
 * iteration), so the eight working variables stay unrolled in 16 local numbers instead of an
 * array or helper calls that would allocate or box per round (≈ 30× faster than the `bigint` reference).
 */
export function sha512CompressHiLo(hl: Uint32Array, block: Uint8Array): Uint32Array {
  schedule(block);
  let ah = hl[0]!, al = hl[1]!, bh = hl[2]!, bl = hl[3]!, ch = hl[4]!, cl = hl[5]!, dh = hl[6]!, dl = hl[7]!;
  let eh = hl[8]!, el = hl[9]!, fh = hl[10]!, fl = hl[11]!, gh = hl[12]!, gl = hl[13]!, hh = hl[14]!, hl7 = hl[15]!;
  for (let i = 0; i < 160; i += 2) {
    // T1 = h + Σ1(e) + Ch(e, f, g) + K_t + W_t, Σ1 = ROTR^14 ⊕ ROTR^18 ⊕ ROTR^41.
    const S1h = rotrHi(eh, el, 14) ^ rotrHi(eh, el, 18) ^ rotrLo(eh, el, 9);
    const S1l = rotrLo(eh, el, 14) ^ rotrLo(eh, el, 18) ^ rotrHi(eh, el, 9);
    const t1l = (hl7 >>> 0) + (S1l >>> 0) + (((el & fl) ^ (~el & gl)) >>> 0) + K[i + 1]! + W[i + 1]!;
    const t1h = hh + S1h + ((eh & fh) ^ (~eh & gh)) + K[i]! + W[i]! + Math.floor(t1l / TWO32);
    // T2 = Σ0(a) + Maj(a, b, c), Σ0 = ROTR^28 ⊕ ROTR^34 ⊕ ROTR^39.
    const S0h = rotrHi(ah, al, 28) ^ rotrLo(ah, al, 2) ^ rotrLo(ah, al, 7);
    const S0l = rotrLo(ah, al, 28) ^ rotrHi(ah, al, 2) ^ rotrHi(ah, al, 7);
    const t2l = (S0l >>> 0) + (((al & bl) ^ (al & cl) ^ (bl & cl)) >>> 0);
    const t2h = S0h + ((ah & bh) ^ (ah & ch) ^ (bh & ch)) + Math.floor(t2l / TWO32);
    hh = gh;
    hl7 = gl;
    gh = fh;
    gl = fl;
    fh = eh;
    fl = el;
    const eLow = (dl >>> 0) + (t1l >>> 0);
    eh = (dh + t1h + Math.floor(eLow / TWO32)) | 0;
    el = eLow | 0;
    dh = ch;
    dl = cl;
    ch = bh;
    cl = bl;
    bh = ah;
    bl = al;
    const aLow = (t1l >>> 0) + (t2l >>> 0);
    ah = (t1h + t2h + Math.floor(aLow / TWO32)) | 0;
    al = aLow | 0;
  }
  addVars(hl, [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl7]);
  return hl;
}
