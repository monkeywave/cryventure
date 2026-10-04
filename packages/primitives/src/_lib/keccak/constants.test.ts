import { describe, expect, it } from 'vitest';
import { KECCAK_LANE_BYTES, KECCAK_LANES, KECCAK_ROUNDS, KECCAK_STATE_BYTES, laneIndex, PI_SOURCE, RHO_OFFSETS, ROUND_CONSTANTS } from './constants.ts';

/** FIPS 202 Algorithm 5: rc(t) = the x⁰ coefficient of x^t mod x⁸ + x⁶ + x⁵ + x⁴ + 1, as the LFSR over R[0..7]. */
function rc(t: number): number {
  if (t % 255 === 0) return 1;
  let R = [1, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 1; i <= t % 255; i++) {
    R = [0, ...R];
    R[0] = R[0]! ^ R[8]!;
    R[4] = R[4]! ^ R[8]!;
    R[5] = R[5]! ^ R[8]!;
    R[6] = R[6]! ^ R[8]!;
    R = R.slice(0, 8);
  }
  return R[0]!;
}

/** Algorithm 6: RC[i_r] has bit 2^j − 1 = rc(j + 7·i_r), j = 0 … 6. */
function roundConstantFromLfsr(round: number): bigint {
  let value = 0n;
  for (let j = 0; j <= 6; j++) value |= BigInt(rc(j + 7 * round)) << BigInt(2 ** j - 1);
  return value;
}

describe('Keccak-f[1600] geometry (FIPS 202 Table 1, §3.1.2)', () => {
  it('has 25 lanes of 8 bytes, 200 bytes and 24 rounds', () => {
    expect([KECCAK_LANES, KECCAK_LANE_BYTES, KECCAK_STATE_BYTES, KECCAK_ROUNDS]).toEqual([25, 8, 200, 24]);
  });

  it('indexes lane (x, y) as x + 5y', () => {
    expect([laneIndex(0, 0), laneIndex(4, 0), laneIndex(0, 1), laneIndex(3, 4)]).toEqual([0, 4, 5, 23]);
  });
});

describe('ROUND_CONSTANTS (FIPS 202 §3.2.5)', () => {
  it('equals Algorithm 6 over the LFSR of Algorithm 5 for all 24 rounds', () => {
    expect(ROUND_CONSTANTS.map((_, round) => roundConstantFromLfsr(round))).toEqual([...ROUND_CONSTANTS]);
  });

  it('has the known first and last values', () => {
    expect([ROUND_CONSTANTS[0], ROUND_CONSTANTS[1], ROUND_CONSTANTS[23]]).toEqual([0x1n, 0x8082n, 0x8000000080008008n]);
    expect([rc(0), rc(255), rc(1)]).toEqual([1, 1, 0]);
  });
});

describe('RHO_OFFSETS (FIPS 202 Algorithm 2)', () => {
  it('equals the walk (x, y) ← (y, 2x + 3y) from (1, 0) with offsets (t + 1)(t + 2)/2 mod 64', () => {
    const offsets = new Array<number>(25).fill(0);
    let [x, y] = [1, 0];
    for (let t = 0; t < 24; t++) {
      offsets[laneIndex(x, y)] = (((t + 1) * (t + 2)) / 2) % 64;
      [x, y] = [y, (2 * x + 3 * y) % 5];
    }
    expect(offsets).toEqual([...RHO_OFFSETS]);
  });

  it('gives 25 distinct offsets in 0 … 63', () => {
    expect(new Set(RHO_OFFSETS).size).toBe(25);
    expect(RHO_OFFSETS.every((offset) => offset >= 0 && offset < 64)).toBe(true);
  });
});

describe('PI_SOURCE (FIPS 202 Algorithm 3)', () => {
  it('is a permutation with A′[x, y] = A[(x + 3y) mod 5, x]', () => {
    expect([...PI_SOURCE].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, index) => index));
    expect(PI_SOURCE[laneIndex(0, 0)]).toBe(0);
    expect(PI_SOURCE[laneIndex(1, 0)]).toBe(laneIndex(1, 1));
    expect(PI_SOURCE[laneIndex(0, 1)]).toBe(laneIndex(3, 0));
    expect(PI_SOURCE[laneIndex(2, 3)]).toBe(laneIndex((2 + 9) % 5, 2));
  });
});
