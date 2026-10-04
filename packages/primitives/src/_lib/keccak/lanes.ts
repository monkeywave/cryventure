import { KECCAK_LANE_BITS, KECCAK_LANE_BYTES, KECCAK_LANES } from './constants.ts';

/**
 * Lanes as `bigint`s (docs/M6.md §2a). FIPS 202 §3.1.2–3.1.3 maps state bit `64·i + z` to bit z of
 * lane i, and B.1 orders bytes so bit 8k + j is bit j of byte k: a lane is the little-endian integer
 * of its 8 bytes.
 */

/** The Keccak state: 25 lanes, index `x + 5y`. */
export type KeccakState = bigint[];

const MASK64 = (1n << 64n) - 1n;
const BITS = BigInt(KECCAK_LANE_BITS);

/** The all-zero state (FIPS 202 §4, Algorithm 8 step 5: S = 0^b). */
export function zeroState(): KeccakState {
  return new Array<bigint>(KECCAK_LANES).fill(0n);
}

/** ROT(lane, n): rotation left by `n` bits within 64 (FIPS 202 §3.2.2), `n` in 0 … 63. */
export function rotl64(lane: bigint, n: number): bigint {
  const shift = BigInt(n % KECCAK_LANE_BITS);
  if (shift === 0n) return lane;
  return ((lane << shift) | (lane >> (BITS - shift))) & MASK64;
}

/** Bitwise NOT within 64 bits. */
export function not64(lane: bigint): bigint {
  return ~lane & MASK64;
}

/** The lane in bytes `offset … offset + 7` of `bytes`, little-endian. */
export function laneFromBytes(bytes: ArrayLike<number>, offset: number): bigint {
  let lane = 0n;
  for (let k = KECCAK_LANE_BYTES - 1; k >= 0; k--) lane = (lane << 8n) | BigInt(bytes[offset + k]! & 0xff);
  return lane;
}

/** The lanes of `bytes` (a multiple of 8 bytes long), little-endian each. */
export function lanesFromBytes(bytes: ArrayLike<number>): bigint[] {
  if (bytes.length % KECCAK_LANE_BYTES !== 0) throw new RangeError(`lanesFromBytes: ${bytes.length} bytes is not a whole number of lanes`);
  return Array.from({ length: bytes.length / KECCAK_LANE_BYTES }, (_, index) => laneFromBytes(bytes, index * KECCAK_LANE_BYTES));
}

/** The 8 bytes of `lane`, little-endian (FIPS 202 byte order). */
export function laneBytes(lane: bigint): number[] {
  return Array.from({ length: KECCAK_LANE_BYTES }, (_, k) => Number((lane >> BigInt(8 * k)) & 0xffn));
}

/** The state (or any lanes) as bytes in FIPS 202 order: lane 0's bytes first, each little-endian. */
export function stateBytes(lanes: readonly bigint[]): number[] {
  const bytes = new Uint8Array(lanes.length * KECCAK_LANE_BYTES);
  const view = new DataView(bytes.buffer);
  lanes.forEach((lane, index) => view.setBigUint64(index * KECCAK_LANE_BYTES, lane, true));
  return Array.from(bytes);
}

/** A lane as 16 lowercase hex digits, most significant first (the `sponge` facet's lane format). */
export function laneHex(lane: bigint): string {
  return lane.toString(16).padStart(KECCAK_LANE_BITS / 4, '0');
}

/** Every lane as `laneHex`. */
export function lanesHex(lanes: readonly bigint[]): string[] {
  return lanes.map(laneHex);
}
