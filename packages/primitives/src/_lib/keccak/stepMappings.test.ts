import { describe, expect, it } from 'vitest';
import { laneIndex, PI_SOURCE, RHO_OFFSETS, ROUND_CONSTANTS } from './constants.ts';
import { not64, rotl64, zeroState } from './lanes.ts';
import { chi, iota, keccakF1600, keccakRound, pi, rho, roundConstant, roundDetailed, theta } from './stepMappings.ts';

/** The SHA3-256 Msg0 state after absorbing 06 … 80 (NIST example): lane 0 = 06, lane 16 = 80 << 56. */
function msg0Absorbed(): bigint[] {
  const state = zeroState();
  state[0] = 0x06n;
  state[16] = 0x8000000000000000n;
  return state;
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
  it('ρ rotates lane i by RHO_OFFSETS[i]', () => {
    const a = sample();
    expect(rho(a)).toEqual(a.map((lane, index) => rotl64(lane, RHO_OFFSETS[index]!)));
  });

  it('π moves lane PI_SOURCE[i] to lane i', () => {
    const a = sample();
    const moved = pi(a);
    expect(moved[laneIndex(1, 0)]).toBe(a[laneIndex(1, 1)]);
    expect(moved).toEqual(PI_SOURCE.map((source) => a[source]));
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
