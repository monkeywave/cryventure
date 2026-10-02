import { describe, expect, it } from 'vitest';
import {
  cellHex,
  displayHex,
  indexDigits,
  indexToHex,
  marksByIndex,
  tableHeaders,
} from './lookupTableModel.ts';

describe('indexDigits / indexToHex', () => {
  it('uses the digits the largest index needs', () => {
    expect(indexDigits(256)).toBe(2);
    expect(indexDigits(16)).toBe(1);
    expect(indexDigits(257)).toBe(3);
    expect(indexDigits(1)).toBe(1);
  });

  it('writes lowercase, zero-padded param values', () => {
    expect(indexToHex(0x53, 256)).toBe('53');
    expect(indexToHex(5, 256)).toBe('05');
    expect(indexToHex(0xab, 4096)).toBe('0ab');
  });
});

describe('displayHex', () => {
  it('is upper-case and padded', () => {
    expect(displayHex(0xed)).toBe('ed');
    expect(displayHex(7)).toBe('07');
    expect(displayHex(3, 1)).toBe('3');
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

  it('labels other widths by first index and column offset', () => {
    expect(tableHeaders(2, 4)).toEqual({ rows: ['0', '4'], cols: ['+0', '+1', '+2', '+3'] });
  });
});

describe('marksByIndex', () => {
  it('groups several marks on one cell', () => {
    const byIndex = marksByIndex([
      { index: 1, role: 'input' },
      { index: 1, role: 'fixed-point' },
      { index: 2, role: 'output' },
    ]);
    expect(byIndex.get(1)?.map((mark) => mark.role)).toEqual(['input', 'fixed-point']);
    expect(byIndex.get(2)).toHaveLength(1);
    expect(marksByIndex(undefined).size).toBe(0);
  });
});

describe('cellHex', () => {
  it('pairs the input index with its entry', () => {
    expect(cellHex({ entries: [0, 0x7c] }, 1)).toEqual({ input: '1', output: '7c' });
  });
});
