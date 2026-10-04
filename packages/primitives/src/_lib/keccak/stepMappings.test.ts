import { describe, expect, it } from 'vitest';
import { laneIndex, ROUND_CONSTANTS } from './constants.ts';
import { not64, rotl64, zeroState } from './lanes.ts';
import { chi, iota, keccakF1600, keccakRound, pi, rho, roundConstant, roundDetailed, theta } from './stepMappings.ts';

/** The SHA3-256 Msg0 state after absorbing 06 … 80 (NIST example): lane 0 = 06, lane 16 = 80 << 56. */
function msg0Absorbed(): bigint[] {
  const state = zeroState();
  state[0] = 0x06n;
  state[16] = 0x8000000000000000n;
  return state;
}

/**
 * FIPS 202 Table 2 (ρ offsets), transcribed literally and indexed by lane x + 5y, so ρ is checked
 * against the standard rather than against the implementation's own RHO_OFFSETS.
 */
const FIPS202_TABLE2_RHO = [
  0, 1, 62, 28, 27, // y = 0
  36, 44, 6, 55, 20, // y = 1
  3, 10, 43, 25, 39, // y = 2
  41, 45, 15, 21, 8, // y = 3
  18, 2, 61, 56, 14, // y = 4
];

/**
 * NIST SHA3-256 Msg0 intermediate states of round 0 (SHA3-256_Msg0.pdf), copied from
 * `sha3/vectors/sha3-nist-examples.json` (`intermediate.states`; _lib may not import a plugin's
 * files). 200 bytes each: lane A[x, y] at bytes 8(x + 5y) …, little-endian within the lane.
 */
const NIST_MSG0_ROUND0 = {
  round0AfterTheta: [
    '07000000000000000600000000000000000000000000008000000000000000000c00000000000000',
    '01000000000000000600000000000000000000000000008000000000000000000c00000000000000',
    '01000000000000000600000000000000000000000000008000000000000000000c00000000000000',
    '01000000000000000600000000000080000000000000008000000000000000000c00000000000000',
    '01000000000000000600000000000000000000000000008000000000000000000c00000000000000',
  ].join(''),
  round0AfterRho: [
    '07000000000000000c00000000000000000000000000002000000000000000000000006000000000',
    '00000000100000000000000000600000200000000000000000000000000000000000c00000000000',
    '08000000000000000018000000000000000000000004000000000000000000000000000000060000',
    '00000000000200000000000000d0000000400000000000000000000000000000000c000000000000',
    '00000400000000001800000000000000000000000000001000000000000000000000030000000000',
  ].join(''),
  round0AfterPi: [
    '07000000000000000000000000600000000000000004000000000000000000000000030000000000',
    '00000000000000000000c0000000000008000000000000000000000000d000000000000000000010',
    '0c0000000000000020000000000000000000000000000000000c0000000000000000040000000000',
    '00000060000000000000000010000000001800000000000000400000000000000000000000000000',
    '00000000000000200000000000000000000000000006000000000000000200001800000000000000',
  ].join(''),
};

/** A NIST state as its 25 lanes. */
function nistLanes(name: keyof typeof NIST_MSG0_ROUND0): bigint[] {
  const hex = NIST_MSG0_ROUND0[name];
  return Array.from({ length: 25 }, (_, lane) => {
    const bytes = hex.slice(lane * 16, lane * 16 + 16).match(/../g)!;
    return BigInt(`0x${bytes.reverse().join('')}`);
  });
}

/** A state with distinct, irregular lanes. */
const sample = (): bigint[] => Array.from({ length: 25 }, (_, index) => (BigInt(index + 1) * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn);

describe('θ (FIPS 202 Algorithm 1)', () => {
  it('computes C, D and the state for the NIST SHA3-256 Msg0 block', () => {
    const { state, c, d } = theta(msg0Absorbed());
    expect(c).toEqual([0x6n, 0x8000000000000000n, 0n, 0n, 0n]);
    expect(d).toEqual([0x1n, 0x6n, 0x8000000000000000n, 0n, 0xcn]);
    // NIST: lanes 0, 1, 2, 4 after θ are 07, 06, 80…, 0c (round0AfterTheta).
    expect([state[0], state[1], state[2], state[3], state[4]]).toEqual([0x7n, 0x6n, 0x8000000000000000n, 0n, 0xcn]);
    expect(state).toEqual(nistLanes('round0AfterTheta'));
  });

  it('returns partial[x] = A[x,0] ⊕ A[x,1] ⊕ A[x,2], and C[x] = partial[x] ⊕ A[x,3] ⊕ A[x,4]', () => {
    const a = sample();
    const { c, partial } = theta(a);
    for (let x = 0; x < 5; x++) {
      expect(partial[x]).toBe(a[laneIndex(x, 0)]! ^ a[laneIndex(x, 1)]! ^ a[laneIndex(x, 2)]!);
      expect(c[x]).toBe(partial[x]! ^ a[laneIndex(x, 3)]! ^ a[laneIndex(x, 4)]!);
    }
  });
});

describe('ρ, π, χ, ι (FIPS 202 Algorithms 2–4, 6)', () => {
  it('ρ rotates lane (x, y) by the FIPS 202 Table 2 offset', () => {
    const a = sample();
    expect(rho(a)).toEqual(a.map((lane, index) => rotl64(lane, FIPS202_TABLE2_RHO[index]!)));
  });

  it('ρ maps the NIST SHA3-256 Msg0 state after θ to the one after ρ', () => {
    expect(rho(nistLanes('round0AfterTheta'))).toEqual(nistLanes('round0AfterRho'));
  });

  it('π sets A′[x, y] = A[(x + 3y) mod 5, x] (FIPS 202 Algorithm 3)', () => {
    const a = sample();
    const moved = pi(a);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) expect(moved[x + 5 * y]).toBe(a[((x + 3 * y) % 5) + 5 * x]);
  });

  it('π maps the NIST SHA3-256 Msg0 state after ρ to the one after π', () => {
    expect(pi(nistLanes('round0AfterRho'))).toEqual(nistLanes('round0AfterPi'));
  });

  it('χ is A[x,y] ⊕ (¬A[x+1,y] ∧ A[x+2,y]) within each row', () => {
    const a = sample();
    const mixed = chi(a);
    expect(mixed[laneIndex(3, 2)]).toBe(a[laneIndex(3, 2)]! ^ (not64(a[laneIndex(4, 2)]!) & a[laneIndex(0, 2)]!));
    expect(mixed[laneIndex(4, 4)]).toBe(a[laneIndex(4, 4)]! ^ (not64(a[laneIndex(0, 4)]!) & a[laneIndex(1, 4)]!));
  });

  it('ι XORs RC[round] into lane 0 only', () => {
    const a = sample();
    const out = iota(a, 3);
    expect(out[0]).toBe(a[0]! ^ ROUND_CONSTANTS[3]!);
    expect(out.slice(1)).toEqual(a.slice(1));
  });

  it('roundConstant rejects rounds outside 0 … 23', () => {
    expect(roundConstant(23)).toBe(0x8000000080008008n);
    expect(() => roundConstant(24)).toThrow(RangeError);
  });
});

describe('Rnd and Keccak-f[1600] (FIPS 202 §3.3–3.4)', () => {
  it('roundDetailed keeps every step, ending in keccakRound', () => {
    const a = sample();
    const detail = roundDetailed(a, 5);
    expect(detail.rho).toEqual(rho(detail.theta.state));
    expect(detail.pi).toEqual(pi(detail.rho));
    expect(detail.chi).toEqual(chi(detail.pi));
    expect(detail.iota).toEqual(keccakRound(a, 5));
    expect(detail.rc).toBe(ROUND_CONSTANTS[5]);
  });

  it('keccakF1600 of the zero state gives the known first lane f1258f7940e1dde7 (Keccak team KeccakF-1600 test)', () => {
    expect(keccakF1600(zeroState())[0]).toBe(0xf1258f7940e1dde7n);
  });

  it('keccakF1600 does not modify its input and rejects a wrong lane count', () => {
    const a = sample();
    const copy = [...a];
    keccakF1600(a);
    expect(a).toEqual(copy);
    expect(() => keccakF1600(a.slice(1))).toThrow(RangeError);
  });
});
