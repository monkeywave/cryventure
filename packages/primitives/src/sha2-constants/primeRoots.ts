import { WORD32, WORD64 } from '../_lib/sha2/words.ts';

/**
 * Exact integer arithmetic for the SHA-2 "nothing up my sleeve" constants: primes and the leading
 * fractional bits of their square and cube roots, with bigint only (no floating point).
 */

export type RootDegree = 2 | 3;

/** The first `count` primes (2, 3, 5, …) by trial division; count ≤ 80 here, so this is instant. */
export function firstPrimes(count: number): number[] {
  const primes: number[] = [];
  for (let candidate = 2; primes.length < count; candidate++) {
    if (primes.every((prime) => prime * prime > candidate || candidate % prime !== 0)) primes.push(candidate);
  }
  return primes;
}

/** ⌊n^(1/k)⌋ for n ≥ 0 and k ≥ 2, by Newton's method on integers (starts above the root, decreases to it). */
export function integerRoot(n: bigint, k: number): bigint {
  if (n < 0n) throw new RangeError('integerRoot: n must be ≥ 0');
  if (!Number.isInteger(k) || k < 2) throw new RangeError('integerRoot: k must be an integer ≥ 2');
  if (n < 2n) return n;
  const degree = BigInt(k);
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / k));
  for (;;) {
    const next = ((degree - 1n) * x + n / x ** (degree - 1n)) / degree;
    if (next >= x) return x;
    x = next;
  }
}

const mask = (bits: number): bigint => (1n << BigInt(bits)) - 1n;

export interface RootWord {
  /** ⌊ᵏ√p⌋. */
  integerPart: bigint;
  /** The `skipBits` fractional bits before the word (0n when nothing is skipped). */
  skipped: bigint;
  /** Fractional bits skipBits+1 … skipBits+bits of ᵏ√p. */
  word: bigint;
}

/**
 * Fractional bits of ᵏ√p, exactly: ⌊ᵏ√p · 2^f⌋ = ⌊ᵏ√(p · 2^(k·f))⌋ with f = skipBits + bits.
 * The low `bits` of that are the word; the `skipBits` above them are the skipped fraction.
 */
export function rootWord(p: number, k: RootDegree, bits: number, skipBits = 0): RootWord {
  const fractionBits = skipBits + bits;
  const scaled = integerRoot(BigInt(p) << BigInt(k * fractionBits), k);
  return {
    integerPart: scaled >> BigInt(fractionBits),
    skipped: (scaled >> BigInt(bits)) & mask(skipBits),
    word: scaled & mask(bits),
  };
}

/** A `bits`-bit word as exactly `bits / 4` lowercase hex digits (big-endian), as the SHA-2 words print. */
export function wordHex(value: bigint, bits: 32 | 64): string {
  return bits === 32 ? WORD32.toHex(Number(value)) : WORD64.toHex(value);
}

/** The big-endian bytes of a `bits`-bit word. */
export function wordBytes(value: bigint, bits: 32 | 64): number[] {
  return bits === 32 ? WORD32.toBytes(Number(value)) : WORD64.toBytes(value);
}
