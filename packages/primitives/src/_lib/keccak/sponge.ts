import { KECCAK_LANE_BYTES } from './constants.ts';
import { laneFromBytes, stateBytes, zeroState, type KeccakState } from './lanes.ts';
import { spongePad, type DomainSuffix } from './padding.ts';
import { keccakF1600 } from './stepMappings.ts';

/**
 * SPONGE[Keccak-f[1600], pad10*1, r] (FIPS 202 §4, Algorithm 8), untraced: absorb XORs each rate
 * block into the first r/64 lanes and permutes; squeeze reads the first r bytes and permutes
 * before every further block.
 */

/** The lanes of the rate: r / 64 (e.g. 17 for r = 1088). */
export function rateLanes(rateBytes: number): number {
  if (rateBytes % KECCAK_LANE_BYTES !== 0) throw new RangeError(`rateLanes: rate ${rateBytes} bytes is not a whole number of lanes`);
  return rateBytes / KECCAK_LANE_BYTES;
}

/** The `rateLanes(block.length)` lanes a rate block contributes, little-endian each. */
export function blockLanes(block: ArrayLike<number>): bigint[] {
  return Array.from({ length: rateLanes(block.length) }, (_, index) => laneFromBytes(block, index * KECCAK_LANE_BYTES));
}

/** S ⊕ (P_i ‖ 0^c): the block XORed into the rate lanes, the capacity untouched (Algorithm 8 step 6). */
export function absorbBlock(state: readonly bigint[], block: ArrayLike<number>): KeccakState {
  const input = blockLanes(block);
  return state.map((lane, index) => (index < input.length ? lane ^ input[index]! : lane));
}

/** Trunc_r(S): the first `rateBytes` bytes of the state (Algorithm 8 step 8). */
export function squeezeBlock(state: readonly bigint[], rateBytes: number): Uint8Array {
  return Uint8Array.from(stateBytes(state).slice(0, rateBytes));
}

/**
 * The first `outputLength` bytes of SPONGE[f, pad, r](`input` ‖ suffix, d). Test reference: only the
 * tests use it, as the `bigint` oracle for the hi/lo sponge and the contexts.
 */
export function sponge(input: Uint8Array, rateBytes: number, suffix: DomainSuffix, outputLength: number): Uint8Array {
  const { padded } = spongePad(input, rateBytes, suffix);
  let state = zeroState();
  for (let offset = 0; offset < padded.length; offset += rateBytes) state = keccakF1600(absorbBlock(state, padded.subarray(offset, offset + rateBytes)));
  return squeezeFrom(state, rateBytes, outputLength);
}

/** `outputLength` bytes squeezed from an absorbed (already permuted) state. */
export function squeezeFrom(absorbed: readonly bigint[], rateBytes: number, outputLength: number): Uint8Array {
  const out = new Uint8Array(outputLength);
  let state = absorbed;
  for (let offset = 0; offset < outputLength; offset += rateBytes) {
    if (offset > 0) state = keccakF1600(state);
    out.set(squeezeBlock(state, rateBytes).subarray(0, outputLength - offset), offset);
  }
  return out;
}
