import type { MathOp, MathTerm } from '@cryventure/core';
import { toSuperscript } from '@cryventure/viz';

/**
 * Pure helpers of the math view: bit-strip model, hex and polynomial formatting, operator glyphs.
 * No React, no i18n: the component translates.
 */

/** One cell of a term's bit strip. `carry` marks the bit a shift carried out (see `carriesOut`). */
export interface BitCell {
  /** Bit position, 0 = LSB. */
  position: number;
  set: boolean;
  emphasised: boolean;
  carry: boolean;
}

type BitStripTerm = Pick<MathTerm, 'value' | 'width' | 'bits' | 'role' | 'op'>;

/**
 * Whether the term's top bit is a carried-out bit: decided by its role or op, never by its width
 * (the 9-bit modulus {11b} has a bit 8 too, but nothing carried it out).
 */
function carriesOut(term: BitStripTerm): boolean {
  return term.role === 'carry' || term.op === 'shift' || term.op === 'xtime';
}

/** The term's bits MSB → LSB (`width` cells). */
export function bitStrip(term: BitStripTerm): BitCell[] {
  const emphasised = new Set(term.bits ?? []);
  const carryPosition = carriesOut(term) ? term.width - 1 : undefined;
  return Array.from({ length: term.width }, (_, index) => {
    const position = term.width - 1 - index;
    return {
      position,
      set: Math.floor(term.value / 2 ** position) % 2 === 1,
      emphasised: emphasised.has(position),
      carry: position === carryPosition,
    };
  });
}

/** `0x`-prefixed lowercase hex, zero-padded to the term width (`0x57`, `0x15c`). */
export function hexOf(value: number, width: number): string {
  return `0x${value.toString(16).padStart(Math.ceil(width / 4), '0')}`;
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
  xtime: '≪',
  shift: '≪',
  reduce: 'mod',
  mul: '⊗',
  square: '²',
  'affine-bit': '⊕',
  result: '=',
};
