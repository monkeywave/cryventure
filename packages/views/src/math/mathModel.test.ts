import { describe, expect, it } from 'vitest';
import { bitStrip, hexOf, OP_GLYPHS, polynomialOf } from './mathModel.ts';

describe('bitStrip', () => {
  it('lists the bits MSB → LSB with emphasis', () => {
    const cells = bitStrip({ value: 0x57, width: 8, role: 'operand', bits: [0, 6] });
    expect(cells.map((cell) => cell.position)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(cells.map((cell) => (cell.set ? 1 : 0)).join('')).toBe('01010111');
    expect(cells.filter((cell) => cell.emphasised).map((cell) => cell.position)).toEqual([6, 0]);
    expect(cells.some((cell) => cell.carry)).toBe(false);
  });

  it('marks the producer-declared carry bit (bit 8 of a shifted 9-bit product)', () => {
    const cells = bitStrip({ value: 0x15c, width: 9, role: 'intermediate', op: 'shift', carryBit: 8 });
    expect(cells).toHaveLength(9);
    expect(cells[0]).toEqual({ position: 8, set: true, emphasised: false, carry: true });
    expect(cells.slice(1).some((cell) => cell.carry)).toBe(false);
  });

  it('marks the top bit of a shifted product and every bit of a carry term', () => {
    expect(bitStrip({ value: 0x15c, width: 9, role: 'carry', op: 'shift' })[0]!.carry).toBe(true);
    expect(bitStrip({ value: 1, width: 1, role: 'carry' })).toEqual([{ position: 0, set: true, emphasised: false, carry: true }]);
  });

  it('never marks the 9-bit modulus {11b} (or any other non-shifted 9-bit term) as a carry', () => {
    expect(bitStrip({ value: 0x11b, width: 9, role: 'constant', op: 'reduce' }).some((cell) => cell.carry)).toBe(false);
    expect(bitStrip({ value: 0x15c, width: 9, role: 'intermediate' }).some((cell) => cell.carry)).toBe(false);
    expect(bitStrip({ value: 0x15c, width: 9, role: 'intermediate', op: 'shift' }).some((cell) => cell.carry)).toBe(false);
  });

  it('handles 32-bit values without sign problems', () => {
    expect(bitStrip({ value: 0x80000000, width: 32, role: 'operand' })[0]!.set).toBe(true);
  });
});

describe('hexOf', () => {
  it('pads to the width', () => {
    expect(hexOf(0x7, 8)).toBe('0x07');
    expect(hexOf(0x15c, 9)).toBe('0x15c');
    expect(hexOf(1, 1)).toBe('0x1');
  });
});

describe('polynomialOf', () => {
  it('formats the FIPS 197 examples', () => {
    expect(polynomialOf(0x57)).toBe('x⁶ + x⁴ + x² + x + 1');
    expect(polynomialOf(0x83)).toBe('x⁷ + x + 1');
    expect(polynomialOf(0x11b)).toBe('x⁸ + x⁴ + x³ + x + 1');
  });

  it('handles 0, 1 and multi-digit exponents', () => {
    expect(polynomialOf(0)).toBe('0');
    expect(polynomialOf(1)).toBe('1');
    expect(polynomialOf(2 ** 12)).toBe('x¹²');
  });
});

describe('OP_GLYPHS', () => {
  it('uses the conventional symbols', () => {
    expect(OP_GLYPHS.xor).toBe('⊕');
    expect(OP_GLYPHS.mul).toBe('⊗');
    expect(OP_GLYPHS.result).toBe('=');
  });
});
