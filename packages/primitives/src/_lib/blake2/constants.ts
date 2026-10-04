/**
 * BLAKE2 constants (RFC 7693 §2.6–2.7, §3.2): the IVs, the message schedule σ and the G positions.
 * The IVs equal the SHA-256 and SHA-512 initial hash values (FIPS 180-4 §5.3.3, §5.3.5): the
 * fractional parts of the square roots of the first eight primes.
 */

/** BLAKE2s IV[0..7] (RFC 7693 §2.6). */
export const BLAKE2S_IV: readonly number[] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** BLAKE2b IV[0..7] (RFC 7693 §2.6). */
export const BLAKE2B_IV: readonly bigint[] = [
  0x6a09e667f3bcc908n,
  0xbb67ae8584caa73bn,
  0x3c6ef372fe94f82bn,
  0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n,
  0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn,
  0x5be0cd19137e2179n,
];

/** The message word permutations σ[0..9] (RFC 7693 §2.7); round i uses σ[i mod 10]. */
export const SIGMA: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];

/** The (a, b, c, d) indices of G call i in a round (RFC 7693 §3.2): i = 0 … 3 columns, 4 … 7 diagonals. */
export const G_POSITIONS: readonly (readonly [number, number, number, number])[] = [
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [0, 5, 10, 15],
  [1, 6, 11, 12],
  [2, 7, 8, 13],
  [3, 4, 9, 14],
];

/** The G rotation constants (R1, R2, R3, R4), RFC 7693 §2.1. */
export const BLAKE2S_ROTATIONS = [16, 12, 8, 7] as const;
export const BLAKE2B_ROTATIONS = [32, 24, 16, 63] as const;

/**
 * Parameter block word 0 (RFC 7693 §2.5): digest length nn, key length kk, fanout 1, depth 1, i.e.
 * 0x0101kknn; the other parameter words are zero (no salt or personalization).
 */
export function parameterWord0(outputBytes: number, keyBytes: number): number {
  return (0x01010000 | (keyBytes << 8) | outputBytes) >>> 0;
}
