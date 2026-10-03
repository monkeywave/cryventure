import { describe, expect, it } from 'vitest';
import { allCellHex, cellHex, indexDigits, tableHeaders } from './lookupTableModel.ts';

describe('indexDigits', () => {
  it('uses the digits the largest index needs', () => {
    expect(indexDigits(256)).toBe(2);
    expect(indexDigits(16)).toBe(1);
    expect(indexDigits(257)).toBe(3);
    expect(indexDigits(1)).toBe(1);
  });
});

describe('tableHeaders', () => {
  it('labels a 16×16 table by nibble', () => {
    const { rows, cols } = tableHeaders(16, 16);
    expect(rows[5]).toBe('5x');
    expect(cols[3]).toBe('x3');
    expect(rows).toHaveLength(16);
    expect(cols.at(-1)).toBe('xf');
  });

  it('pads the row nibbles of a taller table', () => {
    const { rows, cols } = tableHeaders(256, 16);
    expect(rows[0x1a]).toBe('1ax');
    expect(cols[3]).toBe('xx3');
  });
});

describe('cellHex', () => {
  it('pairs the zero-padded input index with its 2-digit entry', () => {
    expect(cellHex({ entries: [0, 0x7c] }, 1)).toEqual({ input: '1', output: '7c' });
    const sbox = { entries: Array.from({ length: 256 }, (_, index) => index) };
    expect(cellHex(sbox, 5)).toEqual({ input: '05', output: '05' });
    expect(cellHex({ entries: Array.from({ length: 4096 }, () => 7) }, 0xab)).toEqual({
      input: '0ab',
      output: '07',
    });
  });

  it('allCellHex lists every cell in index order', () => {
    expect(allCellHex({ entries: [0xed, 0x0a] })).toEqual([
      { input: '0', output: 'ed' },
      { input: '1', output: '0a' },
    ]);
  });
});
