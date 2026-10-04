import { hexDigits, type MathFacet, type MathOp, type MathTerm } from '@cryventure/core';
import { toSuperscript } from '@cryventure/viz';

/**
 * Pure helpers of the math view: bit-strip model, hex and polynomial formatting, operator glyphs.
 * No React, no i18n: the component translates.
 */

/** One cell of a term's bit strip. `carry` marks the bit a shift carried out (see `carryPosition`). */
export interface BitCell {
  /** Bit position, 0 = LSB. */
  position: number;
  set: boolean;
  emphasised: boolean;
  carry: boolean;
}

type BitStripTerm = Pick<MathTerm, 'value' | 'width' | 'bits' | 'role' | 'op' | 'carryBit'>;

/**
 * The carried-out bit as the producer marks it: a `carry` term is one as a whole (its top bit),
 * otherwise `carryBit`. Never guessed from the width (the 9-bit modulus {11b} has a bit 8 too).
 */
function carryPosition(term: BitStripTerm): number | undefined {
  return term.role === 'carry' ? term.width - 1 : term.carryBit;
}

/** The term's bits MSB → LSB (`width` cells). */
export function bitStrip(term: BitStripTerm): BitCell[] {
  const emphasised = new Set(term.bits ?? []);
  const carry = carryPosition(term);
  return Array.from({ length: term.width }, (_, index) => {
    const position = term.width - 1 - index;
    return {
      position,
      set: Math.floor(term.value / 2 ** position) % 2 === 1,
      emphasised: emphasised.has(position),
      carry: position === carry,
    };
  });
}

/** `0x`-prefixed lowercase hex, zero-padded to the term width (`0x57`, `0x15c`). */
export function hexOf(value: number, width: number): string {
  return `0x${hexDigits(value, Math.ceil(width / 4))}`;
}

function monomial(exponent: number): string {
  if (exponent === 0) return '1';
  if (exponent === 1) return 'x';
  return `x${toSuperscript(String(exponent)) ?? `^${exponent}`}`;
}

/** Polynomial over GF(2) whose coefficients are the bits of `value`: 0x57 → "x⁶ + x⁴ + x² + x + 1". */
export function polynomialOf(value: number): string {
  const terms: string[] = [];
  for (let exponent = Math.floor(Math.log2(Math.max(value, 1))); exponent >= 0; exponent--)
    if (Math.floor(value / 2 ** exponent) % 2 === 1) terms.push(monomial(exponent));
  return terms.length === 0 ? '0' : terms.join(' + ');
}

/** Visible operator glyph per op; the accessible name comes from `view.math.op.<op>`. */
export const OP_GLYPHS: Record<MathOp, string> = {
  xor: '⊕',
  shift: '≪',
  reduce: 'mod',
  mul: '⊗',
  square: '²',
  'affine-bit': '⊕',
  result: '=',
};

/** Ops that never involve the field modulus: GF(2⁸) addition is a bitwise XOR, `result` just names the outcome. */
const BITWISE_OPS: ReadonlySet<MathOp | undefined> = new Set<MathOp | undefined>(['xor', 'result', undefined]);

/**
 * Whether the facet's equations are GF(2⁸) arithmetic the modulus matters for. Every math facet
 * declares `notation.field: 'gf2^8'`, so this reads the terms: a facet that only XORs bytes (the HMAC
 * ipad/opad bit strips) never reduces; any other op (mul, square, shift, reduce, affine-bit) or a
 * facet without any XOR (an inversion such as ginv) does.
 */
export function usesModulus(facet: MathFacet): boolean {
  const terms = facet.steps.flatMap((step) => step.terms);
  const xorOnly = terms.every((term) => term.role !== 'carry' && BITWISE_OPS.has(term.op)) && terms.some((term) => term.op === 'xor');
  return !xorOnly;
}
