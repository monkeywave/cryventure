/**
 * Keccak-f[1600] as data (FIPS 202 §3.1–3.2): the 5 × 5 lane geometry, the ι round constants, the ρ
 * offsets and the π map. Lane index `x + 5y` (FIPS 202 §3.1.2: `A[x, y, z] = S[w(5y + x) + z]`).
 */

/** Lanes per row (x) and rows (y). */
export const KECCAK_WIDTH = 5;
export const KECCAK_LANES = KECCAK_WIDTH * KECCAK_WIDTH;
/** Lane width w = 64 bits (b = 1600, FIPS 202 Table 1). */
export const KECCAK_LANE_BITS = 64;
export const KECCAK_LANE_BYTES = KECCAK_LANE_BITS / 8;
/** The state: b = 1600 bits = 200 bytes. */
export const KECCAK_STATE_BYTES = KECCAK_LANES * KECCAK_LANE_BYTES;
/** n_r = 12 + 2ℓ = 24 rounds (FIPS 202 §3.4). */
export const KECCAK_ROUNDS = 24;

/** The lane index of (x, y). */
export const laneIndex = (x: number, y: number): number => x + KECCAK_WIDTH * y;

/**
 * RC[i_r] for ι (FIPS 202 §3.2.5, Algorithm 6): bit 2^j − 1 of RC is rc(j + 7·i_r). The keccak-constants
 * producer derives them from the LFSR of Algorithm 5; the tests check both against each other.
 */
export const ROUND_CONSTANTS: readonly bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/**
 * ρ (FIPS 202 §3.2.2, Table 2): lane `x + 5y` is rotated left by `RHO_OFFSETS[x + 5y]` bits (the
 * offsets (t + 1)(t + 2)/2 mod 64 of Algorithm 2, lane (0, 0) unrotated).
 */
export const RHO_OFFSETS: readonly number[] = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

/**
 * π (FIPS 202 §3.2.3, Algorithm 3): A′[x, y] = A[(x + 3y) mod 5, x], so after π lane `x + 5y` holds
 * what lane `PI_SOURCE[x + 5y]` held.
 */
export const PI_SOURCE: readonly number[] = Array.from({ length: KECCAK_LANES }, (_, index) => {
  const x = index % KECCAK_WIDTH;
  const y = Math.floor(index / KECCAK_WIDTH);
  return laneIndex((x + 3 * y) % KECCAK_WIDTH, x);
});
