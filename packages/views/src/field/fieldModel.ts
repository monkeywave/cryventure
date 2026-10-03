import { byteToHex, FIELD_ELEMENT_BYTES, type FieldStep, type FieldTerm, type Lens } from '@cryventure/core';

/**
 * Pure helpers of the field view (GF(2¹²⁸), docs/M4.md §3e): byte and bit strips in GCM bit order,
 * sparse polynomial notation, operator glyphs and the lens columns. No React, no i18n.
 *
 * GCM order: bit i is bit 7 − (i mod 8) of byte ⌊i / 8⌋, so bit 0 = MSB of byte 0 = coefficient of x⁰.
 */

const BITS_PER_BYTE = 8;

/** Set exponents a polynomial lists before it truncates with "+ n more". */
export const POLYNOMIAL_TERMS_SHOWN = 6;

/** One byte of a term's 16-byte strip. */
export interface FieldByteCell {
  index: number;
  hex: string;
  /** GCM bit indices (= exponents) of this byte's emphasised bits, ascending. */
  emphasisedBits: number[];
}

/** One bit of a term's 128-bit strip, in GCM order. */
export interface FieldBitCell {
  /** GCM bit index = exponent of x. */
  exponent: number;
  set: boolean;
  emphasised: boolean;
}

/** Whether GCM bit `exponent` of `bytes` is set. */
export function isBitSet(bytes: readonly number[], exponent: number): boolean {
  const byte = bytes[Math.floor(exponent / BITS_PER_BYTE)] ?? 0;
  return ((byte >> (BITS_PER_BYTE - 1 - (exponent % BITS_PER_BYTE))) & 1) === 1;
}

/** The 16 byte cells of a term, each with the emphasised bits it holds. */
export function byteCells(term: Pick<FieldTerm, 'bytes' | 'bits'>): FieldByteCell[] {
  const emphasised = [...new Set(term.bits ?? [])].sort((a, b) => a - b);
  return Array.from({ length: FIELD_ELEMENT_BYTES }, (_, index) => ({
    index,
    hex: byteToHex(term.bytes[index] ?? 0),
    emphasisedBits: emphasised.filter((bit) => Math.floor(bit / BITS_PER_BYTE) === index),
  }));
}

/** The 8 bit cells of byte `byteIndex` of a term, in GCM order (x^(8·byteIndex) first). */
export function bitCellsOfByte(term: Pick<FieldTerm, 'bytes' | 'bits'>, byteIndex: number): FieldBitCell[] {
  const emphasised = new Set(term.bits ?? []);
  return Array.from({ length: BITS_PER_BYTE }, (_, offset) => {
    const exponent = byteIndex * BITS_PER_BYTE + offset;
    return { exponent, set: isBitSet(term.bytes, exponent), emphasised: emphasised.has(exponent) };
  });
}

/** The bits of byte `byteIndex` as a 0/1 string in GCM order (`10000111`). */
export function bitString(cells: readonly FieldBitCell[]): string {
  return cells.map((cell) => (cell.set ? '1' : '0')).join('');
}

/** Exponents of the set bits, ascending: the polynomial's terms. */
export function setExponents(bytes: readonly number[]): number[] {
  const exponents: number[] = [];
  for (let exponent = 0; exponent < bytes.length * BITS_PER_BYTE; exponent++) if (isBitSet(bytes, exponent)) exponents.push(exponent);
  return exponents;
}

/** A sparse polynomial: caret notation of the first set exponents (for `MathText`) and how many are left out. */
export interface SparsePolynomial {
  /** `x^0 + x^5 + x^9`, or `0` for the zero element. */
  text: string;
  more: number;
}

/** The term's polynomial with at most `limit` set exponents listed (lowest first). */
export function sparsePolynomial(bytes: readonly number[], limit: number = POLYNOMIAL_TERMS_SHOWN): SparsePolynomial {
  const exponents = setExponents(bytes);
  if (exponents.length === 0) return { text: '0', more: 0 };
  const shown = exponents.slice(0, limit);
  return { text: shown.map((exponent) => `x^${exponent}`).join(' + '), more: exponents.length - shown.length };
}

/** The facet's modulus in spaced caret notation: `x^128+x^7+x^2+x+1` → `x^128 + x^7 + x^2 + x + 1`. */
export function spacedPolynomial(compact: string): string {
  return compact.split('+').join(' + ');
}

/** Whether the step reduces by R (a term with op `reduce`): the cryptographer lens then explains R. */
export function reducesByR(step: Pick<FieldStep, 'terms'>): boolean {
  return step.terms.some((term) => term.op === 'reduce');
}

export type FieldOp = NonNullable<FieldTerm['op']>;

/**
 * Visible operator glyph per op (PLAN §3: ⊗ GF-mul); the accessible name comes from
 * `view.field.op.<op>`. In GCM order a right shift multiplies by x, hence ≫.
 */
export const OP_GLYPHS: Readonly<Record<FieldOp, string>> = {
  xor: '⊕',
  shift: '≫',
  reduce: '⊕R',
  mul: '⊗',
  square: '²',
  'affine-bit': '⊕',
  result: '=',
  select: '↧',
};

/** What a lens shows: hex in the byte cells, the bit strips (always or on expand), polynomial notation. */
export interface FieldColumns {
  hex: boolean;
  /** `always`: every term's bits; `expand`: per term on request; `never`. */
  bits: 'always' | 'expand' | 'never';
  polynomial: boolean;
}

export function columnsFor(lens: Lens): FieldColumns {
  if (lens === 'story') return { hex: false, bits: 'never', polynomial: false };
  if (lens === 'cryptographer') return { hex: true, bits: 'always', polynomial: true };
  return { hex: true, bits: 'expand', polynomial: false };
}
