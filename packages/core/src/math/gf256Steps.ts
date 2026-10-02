/**
 * Pure "explain" functions for GF(2^8) arithmetic: they compute the same values as `gf256.ts` and
 * return every intermediate as plain data (no i18n, no tracer), for views and narration to render.
 */
import { gmul } from './gf256.ts';

/** A single bit value. */
export type Bit = 0 | 1;

/** The reduction constant {1b}: x^8 ≡ x^4 + x^3 + x + 1 once the carried-out x^8 term is dropped. */
export const XTIME_REDUCTION = 0x1b;

/** One multiplication by x: shift left, and ⊕ {1b} when bit 7 was carried out. */
export interface XtimeSteps {
  input: number;
  /** `input << 1`, unreduced (9 bits). */
  shifted: number;
  /** Bit 7 of `input`, i.e. bit 8 of `shifted`. */
  carry: Bit;
  /** Whether {1b} was XORed in (iff `carry` is 1). */
  reduced: boolean;
  result: number;
}

/** Explains `xtime(a)`. */
export function xtimeSteps(a: number): XtimeSteps {
  const input = a & 0xff;
  const shifted = input << 1;
  const carry: Bit = shifted & 0x100 ? 1 : 0;
  const reduced = carry === 1;
  const result = (shifted & 0xff) ^ (reduced ? XTIME_REDUCTION : 0);
  return { input, shifted, carry, reduced, result };
}

/** One bit `i` of `b` in shift-and-add multiplication. */
export interface GmulBitStep {
  /** Bit position i of `b` (0 = LSB). */
  bit: number;
  /** Value of bit i of `b`. */
  bBit: Bit;
  /** a·x^i (reduced); obtained from a·x^(i-1) by one xtime (for i = 0 it is `a`). */
  addend: number;
  /** Bit carried out while computing `addend` from a·x^(i-1) (0 for i = 0). */
  carry: Bit;
  /** Whether computing `addend` needed ⊕ {1b} (false for i = 0). */
  reduced: boolean;
  /** Whether `addend` was XORed into the accumulator (iff `bBit` is 1). */
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

type Addend = Pick<XtimeSteps, 'result' | 'carry' | 'reduced'>;

function gmulBitStep(bit: number, b: number, addend: Addend, acc: number): GmulBitStep {
  const bBit: Bit = (b >> bit) & 1 ? 1 : 0;
  const added = bBit === 1;
  const { result, carry, reduced } = addend;
  return { bit, bBit, addend: result, carry, reduced, added, acc: added ? acc ^ result : acc };
}

/** Explains `gmul(a, b)` (Russian-peasant multiplication over all 8 bits of `b`). */
export function gmulSteps(a: number, b: number): GmulSteps {
  const bits: GmulBitStep[] = [];
  let previous = gmulBitStep(0, b & 0xff, { result: a & 0xff, carry: 0, reduced: false }, 0);
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
  /** Left operand (the running power). */
  left: number;
  /** Right operand: `left` again for a square, the base `a` for a multiply. */
  right: number;
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

function powerStep(op: GinvStep['op'], left: number, right: number, exponent: number): GinvStep {
  return { op, left, right, exponent, value: gmul(left, right) };
}

/** Explains `ginv(a)` as a^254 by left-to-right square-and-multiply (7 squares, 6 multiplies). */
export function ginvSteps(a: number): GinvSteps {
  const input = a & 0xff;
  const steps: GinvStep[] = [];
  let value = input;
  let exponent = 1;
  for (let bit = 6; bit >= 0; bit--) {
    const square = powerStep('square', value, value, exponent * 2);
    steps.push(square);
    ({ value, exponent } = square);
    if (((GINV_EXPONENT >> bit) & 1) === 0) continue;
    const multiply = powerStep('multiply', value, input, exponent + 1);
    steps.push(multiply);
    ({ value, exponent } = multiply);
  }
  return { input, steps, result: value };
}
