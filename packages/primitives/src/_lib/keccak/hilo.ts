import { KECCAK_LANE_BYTES, KECCAK_LANES, KECCAK_ROUNDS, ROUND_CONSTANTS } from './constants.ts';

/**
 * Keccak-f[1600] on 32-bit lane halves (docs/M7.md §2a): the same permutation as `keccakF1600`
 * (FIPS 202 §3.4) without `bigint`, for the `Hash` port's functions and contexts only. The traced
 * `sha3` / `keccak-constants` recordings keep the `bigint` lanes of `stepMappings.ts`.
 *
 * Layout (split lanes, not bit-interleaved): lane i = x + 5y is (`s[2i]`, `s[2i + 1]`) = (low, high)
 * 32 bits, so the array written as little-endian 32-bit words is the 200-byte state in FIPS 202
 * byte order. Every rotation is two shifts per half (halves swapped for offsets ≥ 32).
 */

/** The hi/lo state: 50 entries for the 25 lanes. */
export type KeccakHiLoState = Uint32Array;

export const HILO_STATE_WORDS = 2 * KECCAK_LANES;

const MASK32 = 0xffffffffn;

/** The all-zero hi/lo state. */
export function zeroHiLoState(): KeccakHiLoState {
  return new Uint32Array(HILO_STATE_WORDS);
}

/** `bigint` lanes as a hi/lo state (low half first). Test reference: only the tests use it, to compare with `keccakF1600`. */
export function toHiLoState(lanes: readonly bigint[]): KeccakHiLoState {
  const state = new Uint32Array(lanes.length * 2);
  lanes.forEach((lane, index) => {
    state[2 * index] = Number(lane & MASK32);
    state[2 * index + 1] = Number((lane >> 32n) & MASK32);
  });
  return state;
}

/** The `bigint` lanes of a hi/lo state. Test reference: only the tests use it, to compare with `keccakF1600`. */
export function fromHiLoState(state: KeccakHiLoState): bigint[] {
  return Array.from({ length: state.length / 2 }, (_, index) => (BigInt(state[2 * index + 1]!) << 32n) | BigInt(state[2 * index]!));
}

/** The little-endian 32-bit word at `offset` of `bytes`. */
const le32 = (bytes: ArrayLike<number>, offset: number): number => (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;

/** S ⊕= (P ‖ 0^c) in place: the rate block (a whole number of lanes) XORed into the first lanes; returns `state`. */
export function absorbHiLo(state: KeccakHiLoState, block: ArrayLike<number>): KeccakHiLoState {
  if (block.length % KECCAK_LANE_BYTES !== 0) throw new RangeError(`absorbHiLo: ${block.length} bytes is not a whole number of lanes`);
  for (let word = 0; word < block.length / 4; word++) state[word]! ^= le32(block, 4 * word);
  return state;
}

/** The first `length` bytes of the state in FIPS 202 byte order (Trunc, or the whole 200 bytes). */
export function hiLoStateBytes(state: KeccakHiLoState, length: number = state.length * 4): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) bytes[index] = state[index >>> 2]! >>> (8 * (index & 3));
  return bytes;
}

const RC_LO = Uint32Array.from(ROUND_CONSTANTS, (rc) => Number(rc & MASK32));
const RC_HI = Uint32Array.from(ROUND_CONSTANTS, (rc) => Number(rc >> 32n));

/**
 * Keccak-f[1600] (FIPS 202 §3.4) on a hi/lo state, in place; returns it. The 25 lanes live in 50
 * local int32s (lN, hN = low, high half of lane N = x + 5y) for all 24 rounds, and each round is
 * written out lane by lane with the ρ offsets (RHO_OFFSETS) and π moves (PI_SOURCE) as constants:
 * table-driven loops over a `Uint32Array` ran ≈ 10× slower. The tests check it against `keccakF1600`.
 */
// eslint-disable-next-line max-lines-per-function -- unrolled for the docs/M7.md §2e budget; the readable steps are the bigint ones in stepMappings.ts.
export function keccakF1600HiLo(state: KeccakHiLoState): KeccakHiLoState {
  if (state.length !== HILO_STATE_WORDS) throw new RangeError(`keccakF1600HiLo: ${state.length} words, expected ${HILO_STATE_WORDS}`);
  let l0 = state[0]! | 0, h0 = state[1]! | 0;
  let l1 = state[2]! | 0, h1 = state[3]! | 0;
  let l2 = state[4]! | 0, h2 = state[5]! | 0;
  let l3 = state[6]! | 0, h3 = state[7]! | 0;
  let l4 = state[8]! | 0, h4 = state[9]! | 0;
  let l5 = state[10]! | 0, h5 = state[11]! | 0;
  let l6 = state[12]! | 0, h6 = state[13]! | 0;
  let l7 = state[14]! | 0, h7 = state[15]! | 0;
  let l8 = state[16]! | 0, h8 = state[17]! | 0;
  let l9 = state[18]! | 0, h9 = state[19]! | 0;
  let l10 = state[20]! | 0, h10 = state[21]! | 0;
  let l11 = state[22]! | 0, h11 = state[23]! | 0;
  let l12 = state[24]! | 0, h12 = state[25]! | 0;
  let l13 = state[26]! | 0, h13 = state[27]! | 0;
  let l14 = state[28]! | 0, h14 = state[29]! | 0;
  let l15 = state[30]! | 0, h15 = state[31]! | 0;
  let l16 = state[32]! | 0, h16 = state[33]! | 0;
  let l17 = state[34]! | 0, h17 = state[35]! | 0;
  let l18 = state[36]! | 0, h18 = state[37]! | 0;
  let l19 = state[38]! | 0, h19 = state[39]! | 0;
  let l20 = state[40]! | 0, h20 = state[41]! | 0;
  let l21 = state[42]! | 0, h21 = state[43]! | 0;
  let l22 = state[44]! | 0, h22 = state[45]! | 0;
  let l23 = state[46]! | 0, h23 = state[47]! | 0;
  let l24 = state[48]! | 0, h24 = state[49]! | 0;
  for (let round = 0; round < KECCAK_ROUNDS; round++) {
    // θ: column parities C[x], D[x] = C[x − 1] ⊕ ROT(C[x + 1], 1).
    const cl0 = l0 ^ l5 ^ l10 ^ l15 ^ l20, ch0 = h0 ^ h5 ^ h10 ^ h15 ^ h20;
    const cl1 = l1 ^ l6 ^ l11 ^ l16 ^ l21, ch1 = h1 ^ h6 ^ h11 ^ h16 ^ h21;
    const cl2 = l2 ^ l7 ^ l12 ^ l17 ^ l22, ch2 = h2 ^ h7 ^ h12 ^ h17 ^ h22;
    const cl3 = l3 ^ l8 ^ l13 ^ l18 ^ l23, ch3 = h3 ^ h8 ^ h13 ^ h18 ^ h23;
    const cl4 = l4 ^ l9 ^ l14 ^ l19 ^ l24, ch4 = h4 ^ h9 ^ h14 ^ h19 ^ h24;
    const dl0 = cl4 ^ ((cl1 << 1) | (ch1 >>> 31)), dh0 = ch4 ^ ((ch1 << 1) | (cl1 >>> 31));
    const dl1 = cl0 ^ ((cl2 << 1) | (ch2 >>> 31)), dh1 = ch0 ^ ((ch2 << 1) | (cl2 >>> 31));
    const dl2 = cl1 ^ ((cl3 << 1) | (ch3 >>> 31)), dh2 = ch1 ^ ((ch3 << 1) | (cl3 >>> 31));
    const dl3 = cl2 ^ ((cl4 << 1) | (ch4 >>> 31)), dh3 = ch2 ^ ((ch4 << 1) | (cl4 >>> 31));
    const dl4 = cl3 ^ ((cl0 << 1) | (ch0 >>> 31)), dh4 = ch3 ^ ((ch0 << 1) | (cl0 >>> 31));
    // θ's A[x, y] ⊕ D[x], then ρ (rotate by RHO_OFFSETS) and π (lane i lands where PI_SOURCE names it) into B.
    const bl0 = l0 ^ dl0, bh0 = h0 ^ dh0;
    const tl1 = l6 ^ dl1, th1 = h6 ^ dh1;
    const bl1 = (th1 << 12) | (tl1 >>> 20), bh1 = (tl1 << 12) | (th1 >>> 20); // ρ 44, from lane 6
    const tl2 = l12 ^ dl2, th2 = h12 ^ dh2;
    const bl2 = (th2 << 11) | (tl2 >>> 21), bh2 = (tl2 << 11) | (th2 >>> 21); // ρ 43, from lane 12
    const tl3 = l18 ^ dl3, th3 = h18 ^ dh3;
    const bl3 = (tl3 << 21) | (th3 >>> 11), bh3 = (th3 << 21) | (tl3 >>> 11); // ρ 21, from lane 18
    const tl4 = l24 ^ dl4, th4 = h24 ^ dh4;
    const bl4 = (tl4 << 14) | (th4 >>> 18), bh4 = (th4 << 14) | (tl4 >>> 18); // ρ 14, from lane 24
    const tl5 = l3 ^ dl3, th5 = h3 ^ dh3;
    const bl5 = (tl5 << 28) | (th5 >>> 4), bh5 = (th5 << 28) | (tl5 >>> 4); // ρ 28, from lane 3
    const tl6 = l9 ^ dl4, th6 = h9 ^ dh4;
    const bl6 = (tl6 << 20) | (th6 >>> 12), bh6 = (th6 << 20) | (tl6 >>> 12); // ρ 20, from lane 9
    const tl7 = l10 ^ dl0, th7 = h10 ^ dh0;
    const bl7 = (tl7 << 3) | (th7 >>> 29), bh7 = (th7 << 3) | (tl7 >>> 29); // ρ 3, from lane 10
    const tl8 = l16 ^ dl1, th8 = h16 ^ dh1;
    const bl8 = (th8 << 13) | (tl8 >>> 19), bh8 = (tl8 << 13) | (th8 >>> 19); // ρ 45, from lane 16
    const tl9 = l22 ^ dl2, th9 = h22 ^ dh2;
    const bl9 = (th9 << 29) | (tl9 >>> 3), bh9 = (tl9 << 29) | (th9 >>> 3); // ρ 61, from lane 22
    const tl10 = l1 ^ dl1, th10 = h1 ^ dh1;
    const bl10 = (tl10 << 1) | (th10 >>> 31), bh10 = (th10 << 1) | (tl10 >>> 31); // ρ 1, from lane 1
    const tl11 = l7 ^ dl2, th11 = h7 ^ dh2;
    const bl11 = (tl11 << 6) | (th11 >>> 26), bh11 = (th11 << 6) | (tl11 >>> 26); // ρ 6, from lane 7
    const tl12 = l13 ^ dl3, th12 = h13 ^ dh3;
    const bl12 = (tl12 << 25) | (th12 >>> 7), bh12 = (th12 << 25) | (tl12 >>> 7); // ρ 25, from lane 13
    const tl13 = l19 ^ dl4, th13 = h19 ^ dh4;
    const bl13 = (tl13 << 8) | (th13 >>> 24), bh13 = (th13 << 8) | (tl13 >>> 24); // ρ 8, from lane 19
    const tl14 = l20 ^ dl0, th14 = h20 ^ dh0;
    const bl14 = (tl14 << 18) | (th14 >>> 14), bh14 = (th14 << 18) | (tl14 >>> 14); // ρ 18, from lane 20
    const tl15 = l4 ^ dl4, th15 = h4 ^ dh4;
    const bl15 = (tl15 << 27) | (th15 >>> 5), bh15 = (th15 << 27) | (tl15 >>> 5); // ρ 27, from lane 4
    const tl16 = l5 ^ dl0, th16 = h5 ^ dh0;
    const bl16 = (th16 << 4) | (tl16 >>> 28), bh16 = (tl16 << 4) | (th16 >>> 28); // ρ 36, from lane 5
    const tl17 = l11 ^ dl1, th17 = h11 ^ dh1;
    const bl17 = (tl17 << 10) | (th17 >>> 22), bh17 = (th17 << 10) | (tl17 >>> 22); // ρ 10, from lane 11
    const tl18 = l17 ^ dl2, th18 = h17 ^ dh2;
    const bl18 = (tl18 << 15) | (th18 >>> 17), bh18 = (th18 << 15) | (tl18 >>> 17); // ρ 15, from lane 17
    const tl19 = l23 ^ dl3, th19 = h23 ^ dh3;
    const bl19 = (th19 << 24) | (tl19 >>> 8), bh19 = (tl19 << 24) | (th19 >>> 8); // ρ 56, from lane 23
    const tl20 = l2 ^ dl2, th20 = h2 ^ dh2;
    const bl20 = (th20 << 30) | (tl20 >>> 2), bh20 = (tl20 << 30) | (th20 >>> 2); // ρ 62, from lane 2
    const tl21 = l8 ^ dl3, th21 = h8 ^ dh3;
    const bl21 = (th21 << 23) | (tl21 >>> 9), bh21 = (tl21 << 23) | (th21 >>> 9); // ρ 55, from lane 8
    const tl22 = l14 ^ dl4, th22 = h14 ^ dh4;
    const bl22 = (th22 << 7) | (tl22 >>> 25), bh22 = (tl22 << 7) | (th22 >>> 25); // ρ 39, from lane 14
    const tl23 = l15 ^ dl0, th23 = h15 ^ dh0;
    const bl23 = (th23 << 9) | (tl23 >>> 23), bh23 = (tl23 << 9) | (th23 >>> 23); // ρ 41, from lane 15
    const tl24 = l21 ^ dl1, th24 = h21 ^ dh1;
    const bl24 = (tl24 << 2) | (th24 >>> 30), bh24 = (th24 << 2) | (tl24 >>> 30); // ρ 2, from lane 21
    // χ: A[x, y] = B[x, y] ⊕ (¬B[x + 1, y] ∧ B[x + 2, y]).
    l0 = bl0 ^ (~bl1 & bl2);
    h0 = bh0 ^ (~bh1 & bh2);
    l1 = bl1 ^ (~bl2 & bl3);
    h1 = bh1 ^ (~bh2 & bh3);
    l2 = bl2 ^ (~bl3 & bl4);
    h2 = bh2 ^ (~bh3 & bh4);
    l3 = bl3 ^ (~bl4 & bl0);
    h3 = bh3 ^ (~bh4 & bh0);
    l4 = bl4 ^ (~bl0 & bl1);
    h4 = bh4 ^ (~bh0 & bh1);
    l5 = bl5 ^ (~bl6 & bl7);
    h5 = bh5 ^ (~bh6 & bh7);
    l6 = bl6 ^ (~bl7 & bl8);
    h6 = bh6 ^ (~bh7 & bh8);
    l7 = bl7 ^ (~bl8 & bl9);
    h7 = bh7 ^ (~bh8 & bh9);
    l8 = bl8 ^ (~bl9 & bl5);
    h8 = bh8 ^ (~bh9 & bh5);
    l9 = bl9 ^ (~bl5 & bl6);
    h9 = bh9 ^ (~bh5 & bh6);
    l10 = bl10 ^ (~bl11 & bl12);
    h10 = bh10 ^ (~bh11 & bh12);
    l11 = bl11 ^ (~bl12 & bl13);
    h11 = bh11 ^ (~bh12 & bh13);
    l12 = bl12 ^ (~bl13 & bl14);
    h12 = bh12 ^ (~bh13 & bh14);
    l13 = bl13 ^ (~bl14 & bl10);
    h13 = bh13 ^ (~bh14 & bh10);
    l14 = bl14 ^ (~bl10 & bl11);
    h14 = bh14 ^ (~bh10 & bh11);
    l15 = bl15 ^ (~bl16 & bl17);
    h15 = bh15 ^ (~bh16 & bh17);
    l16 = bl16 ^ (~bl17 & bl18);
    h16 = bh16 ^ (~bh17 & bh18);
    l17 = bl17 ^ (~bl18 & bl19);
    h17 = bh17 ^ (~bh18 & bh19);
    l18 = bl18 ^ (~bl19 & bl15);
    h18 = bh18 ^ (~bh19 & bh15);
    l19 = bl19 ^ (~bl15 & bl16);
    h19 = bh19 ^ (~bh15 & bh16);
    l20 = bl20 ^ (~bl21 & bl22);
    h20 = bh20 ^ (~bh21 & bh22);
    l21 = bl21 ^ (~bl22 & bl23);
    h21 = bh21 ^ (~bh22 & bh23);
    l22 = bl22 ^ (~bl23 & bl24);
    h22 = bh22 ^ (~bh23 & bh24);
    l23 = bl23 ^ (~bl24 & bl20);
    h23 = bh23 ^ (~bh24 & bh20);
    l24 = bl24 ^ (~bl20 & bl21);
    h24 = bh24 ^ (~bh20 & bh21);
    // ι.
    l0 ^= RC_LO[round]!;
    h0 ^= RC_HI[round]!;
  }
  state[0] = l0;
  state[1] = h0;
  state[2] = l1;
  state[3] = h1;
  state[4] = l2;
  state[5] = h2;
  state[6] = l3;
  state[7] = h3;
  state[8] = l4;
  state[9] = h4;
  state[10] = l5;
  state[11] = h5;
  state[12] = l6;
  state[13] = h6;
  state[14] = l7;
  state[15] = h7;
  state[16] = l8;
  state[17] = h8;
  state[18] = l9;
  state[19] = h9;
  state[20] = l10;
  state[21] = h10;
  state[22] = l11;
  state[23] = h11;
  state[24] = l12;
  state[25] = h12;
  state[26] = l13;
  state[27] = h13;
  state[28] = l14;
  state[29] = h14;
  state[30] = l15;
  state[31] = h15;
  state[32] = l16;
  state[33] = h16;
  state[34] = l17;
  state[35] = h17;
  state[36] = l18;
  state[37] = h18;
  state[38] = l19;
  state[39] = h19;
  state[40] = l20;
  state[41] = h20;
  state[42] = l21;
  state[43] = h21;
  state[44] = l22;
  state[45] = h22;
  state[46] = l23;
  state[47] = h23;
  state[48] = l24;
  state[49] = h24;
  return state;
}
