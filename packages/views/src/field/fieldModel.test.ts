import { describe, expect, it } from 'vitest';
import { bitCellsOfByte, bitString, byteCells, columnsFor, isBitSet, OP_GLYPHS, reducesByR, setExponents, spacedPolynomial, sparsePolynomial } from './fieldModel.ts';

/** R = e1 ‖ 0¹²⁰: 1 + x + x² + x⁷ in GCM order. */
const R = [0xe1, ...new Array<number>(15).fill(0)];
const ONE = [0x80, ...new Array<number>(15).fill(0)];
const ZERO = new Array<number>(16).fill(0);

describe('isBitSet / setExponents (GCM order)', () => {
  it('reads bit 0 as the MSB of byte 0', () => {
    expect(isBitSet(ONE, 0)).toBe(true);
    expect(isBitSet(ONE, 7)).toBe(false);
    expect(setExponents(R)).toEqual([0, 1, 2, 7]);
  });

  it('reaches x¹²⁷ as the LSB of byte 15', () => {
    const top = [...ZERO.slice(0, 15), 0x01];
    expect(setExponents(top)).toEqual([127]);
    expect(setExponents(ZERO)).toEqual([]);
  });
});

describe('byteCells', () => {
  it('gives 16 cells with hex and the emphasised bits each byte holds', () => {
    const cells = byteCells({ bytes: R, bits: [127, 0, 7, 0] });
    expect(cells).toHaveLength(16);
    expect(cells[0]).toEqual({ index: 0, hex: 'e1', emphasisedBits: [0, 7] });
    expect(cells[15]?.emphasisedBits).toEqual([127]);
    expect(cells[1]?.emphasisedBits).toEqual([]);
  });

  it('pads short byte arrays with zeros', () => {
    expect(byteCells({ bytes: [1] })[3]?.hex).toBe('00');
  });
});

describe('bitCellsOfByte / bitString', () => {
  it('lists a byte’s bits with their exponents, emphasis included', () => {
    const cells = bitCellsOfByte({ bytes: R, bits: [7] }, 0);
    expect(cells.map((cell) => cell.exponent)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(bitString(cells)).toBe('11100001');
    expect(cells.filter((cell) => cell.emphasised).map((cell) => cell.exponent)).toEqual([7]);
    expect(bitCellsOfByte({ bytes: R }, 1)[0]?.exponent).toBe(8);
  });
});

describe('sparsePolynomial', () => {
  it('lists the set exponents lowest first', () => {
    expect(sparsePolynomial(R)).toEqual({ text: 'x^0 + x^1 + x^2 + x^7', more: 0 });
  });

  it('truncates after the limit and counts the rest', () => {
    expect(sparsePolynomial(new Array<number>(16).fill(0xff), 3)).toEqual({ text: 'x^0 + x^1 + x^2', more: 125 });
  });

  it('writes the zero element as 0', () => {
    expect(sparsePolynomial(ZERO)).toEqual({ text: '0', more: 0 });
  });
});

describe('spacedPolynomial', () => {
  it('spaces the facet’s modulus', () => {
    expect(spacedPolynomial('x^128+x^7+x^2+x+1')).toBe('x^128 + x^7 + x^2 + x + 1');
  });
});

describe('reducesByR', () => {
  it('is true only for a step with a reduce term', () => {
    expect(reducesByR({ terms: [{ id: 'r', label: { key: 'r' }, bytes: R, role: 'constant', op: 'reduce' }] })).toBe(true);
    expect(reducesByR({ terms: [{ id: 'v', label: { key: 'v' }, bytes: R, role: 'intermediate', op: 'shift' }] })).toBe(false);
  });
});

describe('OP_GLYPHS', () => {
  it('uses ⊗ for GF multiplication and ≫ for the GCM shift', () => {
    expect(OP_GLYPHS.mul).toBe('⊗');
    expect(OP_GLYPHS.shift).toBe('≫');
    expect(OP_GLYPHS.select).toBeTruthy();
  });
});

describe('columnsFor', () => {
  it('hides hex and bits in the story lens', () => {
    expect(columnsFor('story')).toEqual({ hex: false, bits: 'never', polynomial: false });
  });

  it('offers bits on expand in the engineer lens', () => {
    expect(columnsFor('engineer')).toEqual({ hex: true, bits: 'expand', polynomial: false });
  });

  it('shows bits and polynomials in the cryptographer lens', () => {
    expect(columnsFor('cryptographer')).toEqual({ hex: true, bits: 'always', polynomial: true });
  });
});
