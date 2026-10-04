import { describe, expect, it } from 'vitest';
import { ROUND_CONSTANTS } from '../_lib/keccak/constants.ts';
import { assembleRoundConstant, bitWord, deriveRoundConstant, fipsRegisterBits, LFSR_PERIOD, LFSR_START, lfsrRegister, lfsrShift, rc, rcBitPosition, type RoundBit } from './lfsr.ts';

/** FIPS 202 Algorithm 5 literally, on the bit array R[0..8] (independent of the byte encoding). */
function rcByAlgorithm5(t: number): number {
  if (t % 255 === 0) return 1;
  let R = [1, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 1; i <= t % 255; i++) {
    R = [0, ...R];
    for (const k of [0, 4, 5, 6]) R[k] = R[k]! ^ R[8]!;
    R = R.slice(0, 8);
  }
  return R[0]!;
}

describe('lfsrShift', () => {
  it('multiplies by x without reduction while bit 7 is clear', () => expect(lfsrShift(0x01)).toBe(0x02));
  it('reduces by x⁸ + x⁶ + x⁵ + x⁴ + 1 when bit 7 shifts out', () => expect(lfsrShift(0x80)).toBe(0x71));
  it('stays within one byte', () => expect(Array.from({ length: 256 }, (_, r) => lfsrShift(r)).every((r) => r >= 0 && r < 256)).toBe(true));
});

describe('lfsrRegister', () => {
  it('starts at R = 10000000, the byte 01', () => expect(lfsrRegister(0)).toBe(LFSR_START));
  it('has period 255 (the polynomial is primitive)', () => {
    expect(lfsrRegister(LFSR_PERIOD)).toBe(LFSR_START);
    expect(Array.from({ length: LFSR_PERIOD - 1 }, (_, t) => lfsrRegister(t + 1)).includes(LFSR_START)).toBe(false);
  });
  it('reduces t mod 255', () => expect(lfsrRegister(300)).toBe(lfsrRegister(45)));
});

describe('rc', () => {
  it('equals FIPS 202 Algorithm 5 for t = 0 … 299', () => {
    expect(Array.from({ length: 300 }, (_, t) => rc(t))).toEqual(Array.from({ length: 300 }, (_, t) => rcByAlgorithm5(t)));
  });
});

describe('fipsRegisterBits', () => {
  it('writes R[0] first', () => {
    expect(fipsRegisterBits(0x01)).toBe('10000000');
    expect(fipsRegisterBits(0x71)).toBe('10001110');
  });
});

describe('rcBitPosition and bitWord', () => {
  it('places rc(j + 7i) at bit 2^j − 1', () => expect([0, 1, 2, 3, 4, 5, 6].map(rcBitPosition)).toEqual([0, 1, 3, 7, 15, 31, 63]));
  it('builds the word with only that bit', () => {
    expect(bitWord({ j: 6, t: 6, bit: 1, position: 63 })).toBe(1n << 63n);
    expect(bitWord({ j: 6, t: 6, bit: 0, position: 63 })).toBe(0n);
  });
});

describe('assembleRoundConstant', () => {
  it('ORs the placed bits', () => {
    const bits: RoundBit[] = [
      { j: 0, t: 0, bit: 1, position: 0 },
      { j: 3, t: 3, bit: 1, position: 7 },
    ];
    expect(assembleRoundConstant(bits)).toBe(0x81n);
  });
});

describe('deriveRoundConstant', () => {
  it('RC[0] = 1: rc(0) = 1, rc(1) … rc(6) = 0', () => {
    const derived = deriveRoundConstant(0);
    expect(derived.bits.map((bit) => [bit.t, bit.bit])).toEqual([[0, 1], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]);
    expect(derived.value).toBe(1n);
    expect(derived.registerAfter).toBe(lfsrRegister(7));
  });

  it('reproduces all 24 constants of the _lib/keccak table', () => {
    expect(ROUND_CONSTANTS.map((_, round) => deriveRoundConstant(round).value)).toEqual([...ROUND_CONSTANTS]);
  });
});
