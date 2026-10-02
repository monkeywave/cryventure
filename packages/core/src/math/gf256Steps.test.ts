import { describe, expect, it } from 'vitest';
import { ginv, gmul, xtime } from './gf256.ts';
import { GINV_EXPONENT, ginvSteps, gmulSteps, XTIME_REDUCTION, xtimeSteps } from './gf256Steps.ts';

const ALL_BYTES = Array.from({ length: 256 }, (_, i) => i);

describe('xtimeSteps', () => {
  it('explains xtime({57}) = {ae} without reduction', () => {
    expect(xtimeSteps(0x57)).toEqual({ input: 0x57, shifted: 0xae, carry: 0, reduced: false, result: 0xae });
  });

  it('reduces by {1b} when bit 7 is carried out', () => {
    expect(xtimeSteps(0x8e)).toEqual({ input: 0x8e, shifted: 0x11c, carry: 1, reduced: true, result: 0x07 });
  });

  it('matches xtime for all 256 bytes and reduces iff the carry is set', () => {
    for (const a of ALL_BYTES) {
      const steps = xtimeSteps(a);
      expect(steps.result).toBe(xtime(a));
      expect(steps.reduced).toBe(steps.carry === 1);
      expect(steps.result).toBe((steps.shifted & 0xff) ^ (steps.reduced ? XTIME_REDUCTION : 0));
    }
  });
});

describe('gmulSteps', () => {
  it('matches the FIPS 197 examples {57}·{83}={c1} and {57}·{13}={fe}', () => {
    expect(gmulSteps(0x57, 0x83).result).toBe(0xc1);
    expect(gmulSteps(0x57, 0x13).result).toBe(0xfe);
  });

  it('records a·x^i, carries and additions for {57}·{13} (FIPS 197 §4.2.1)', () => {
    const { bits } = gmulSteps(0x57, 0x13);
    expect(bits.map((step) => step.addend)).toEqual([0x57, 0xae, 0x47, 0x8e, 0x07, 0x0e, 0x1c, 0x38]);
    expect(bits.map((step) => step.carry)).toEqual([0, 0, 1, 0, 1, 0, 0, 0]);
    expect(bits.map((step) => step.added)).toEqual([true, true, false, false, true, false, false, false]);
    expect(bits.map((step) => step.acc)).toEqual([0x57, 0xf9, 0xf9, 0xf9, 0xfe, 0xfe, 0xfe, 0xfe]);
  });

  it('records 8 consistent bit steps and equals gmul for all 256×256 pairs', () => {
    for (const a of ALL_BYTES) {
      for (const b of ALL_BYTES) {
        const steps = gmulSteps(a, b);
        if (steps.result !== gmul(a, b)) expect(steps.result, `${a}·${b}`).toBe(gmul(a, b));
      }
    }
    const { bits } = gmulSteps(0xff, 0xa5);
    expect(bits.map((step) => step.bit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    bits.forEach((step) => expect(step.reduced).toBe(step.carry === 1));
    bits.forEach((step) => expect(step.added).toBe(step.bBit === 1));
  });

  it('masks operands to bytes', () => {
    expect(gmulSteps(0x157, 0x113)).toMatchObject({ a: 0x57, b: 0x13, result: 0xfe });
  });
});

describe('ginvSteps', () => {
  it('matches the FIPS example {53}^-1 = {ca}', () => {
    expect(ginvSteps(0x53).result).toBe(0xca);
  });

  it('squares 7 times and multiplies 6 times, ending at exponent 254', () => {
    const { steps } = ginvSteps(0x53);
    expect(steps.filter((step) => step.op === 'square')).toHaveLength(7);
    expect(steps.filter((step) => step.op === 'multiply')).toHaveLength(6);
    expect(steps.at(-1)?.exponent).toBe(GINV_EXPONENT);
    expect(steps.map((step) => step.exponent)).toEqual([2, 3, 6, 7, 14, 15, 30, 31, 62, 63, 126, 127, 254]);
  });

  it('records operands consistently and equals ginv for all 256 bytes (ginv(0) = 0)', () => {
    for (const a of ALL_BYTES) {
      const { steps, result } = ginvSteps(a);
      expect(result).toBe(ginv(a));
      for (const step of steps) {
        expect(step.value).toBe(gmul(step.left, step.right));
        expect(step.right).toBe(step.op === 'square' ? step.left : a);
      }
    }
    expect(ginvSteps(0).result).toBe(0);
  });
});
