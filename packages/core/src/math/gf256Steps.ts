/**
 * Pure "explain" functions for GF(2^8) arithmetic: they compute the same values as `gf256.ts` and
 * return every intermediate as plain data (no i18n, no tracer), for views and narration to render.
 */
import { bitOf, type Bit } from './bits.ts';
import { gmul } from './gf256.ts';

/** The reduction constant {1b}: x^8 ≡ x^4 + x^3 + x + 1 once the carried-out x^8 term is dropped. */
export const XTIME_REDUCTION = 0x1b;

/** One multiplication by x: shift left, and ⊕ {1b} when bit 7 was carried out. */
export interface XtimeSteps {
  input: number;
  /** `input << 1`, unreduced (9 bits). */
  shifted: number;
  /** Bit 7 of `input`, i.e. bit 8 of `shifted`; {1b} is XORed in iff it is 1. */
  carry: Bit;
  result: number;
}

/** Explains `xtime(a)`. */
export function xtimeSteps(a: number): XtimeSteps {
  const input = a & 0xff;
  const shifted = input << 1;
  const carry = bitOf(shifted, 8);
  const result = (shifted & 0xff) ^ (carry ? XTIME_REDUCTION : 0);
  return { input, shifted, carry, result };
}

/** One bit `i` of `b` in shift-and-add multiplication. */
export interface GmulBitStep {
  /** Bit position i of `b` (0 = LSB). */
  bit: number;
  /** a·x^i (reduced); obtained from a·x^(i-1) by one xtime (for i = 0 it is `a`). */
  addend: number;
  /** Bit carried out while computing `addend` from a·x^(i-1), so ⊕ {1b} was needed (0 for i = 0). */
  carry: Bit;
  /** Whether `addend` was XORed into the accumulator (iff bit i of `b` is 1). */
  added: boolean;
  /** Accumulator after this bit. */
  acc: number;
}

export interface GmulSteps {
  a: number;
  b: number;
  /** One record per bit of `b`, i = 0..7. */
  bits: GmulBitStep[];
  /** a·b, equal to `gmul(a, b)` and to the last `acc`. */
  result: number;
}

type Addend = Pick<XtimeSteps, 'result' | 'carry'>;

function gmulBitStep(bit: number, b: number, addend: Addend, acc: number): GmulBitStep {
  const added = bitOf(b, bit) === 1;
  const { result, carry } = addend;
  return { bit, addend: result, carry, added, acc: added ? acc ^ result : acc };
}

/** Explains `gmul(a, b)` (Russian-peasant multiplication over all 8 bits of `b`). */
export function gmulSteps(a: number, b: number): GmulSteps {
  const bits: GmulBitStep[] = [];
  let previous = gmulBitStep(0, b & 0xff, { result: a & 0xff, carry: 0 }, 0);
  bits.push(previous);
  for (let bit = 1; bit < 8; bit++) {
    previous = gmulBitStep(bit, b & 0xff, xtimeSteps(previous.addend), previous.acc);
    bits.push(previous);
  }
  return { a: a & 0xff, b: b & 0xff, bits, result: previous.acc };
}

/** Exponent of the inverse: a^254 = a^-1 because the multiplicative group has order 255. */
export const GINV_EXPONENT = 254;

/** One square or multiply of left-to-right square-and-multiply. */
export interface GinvStep {
  op: 'square' | 'multiply';
  /** Left operand: the running power a^previousExponent (squared, or multiplied by the base `a`). */
  left: number;
  /** Exponent of `left`. */
  previousExponent: number;
  /** Exponent e of the running power after this step (value = a^e). */
  exponent: number;
  value: number;
}

export interface GinvSteps {
  input: number;
  /** Starts from a^1 (the leading bit of 254), then for each further bit: square, then multiply if set. */
  steps: GinvStep[];
  /** a^254 = a^-1; for a = 0 every value is 0, matching the convention ginv(0) = 0. */
  result: number;
}

function powerStep(op: GinvStep['op'], left: number, right: number, previousExponent: number, exponent: number): GinvStep {
  return { op, left, previousExponent, exponent, value: gmul(left, right) };
}

/** Explains `ginv(a)` as a^254 by left-to-right square-and-multiply (7 squares, 6 multiplies). */
export function ginvSteps(a: number): GinvSteps {
  const input = a & 0xff;
  const steps: GinvStep[] = [];
  let value = input;
  let exponent = 1;
  for (let bit = 6; bit >= 0; bit--) {
    const square = powerStep('square', value, value, exponent, exponent * 2);
    steps.push(square);
    ({ value, exponent } = square);
    if (bitOf(GINV_EXPONENT, bit) === 0) continue;
    const multiply = powerStep('multiply', value, input, exponent, exponent + 1);
    steps.push(multiply);
    ({ value, exponent } = multiply);
  }
  return { input, steps, result: value };
}
