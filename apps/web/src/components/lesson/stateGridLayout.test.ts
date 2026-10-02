import { describe, expect, it } from 'vitest';
import { AES_STATE_ORDER, AES_STATE_SHAPE, range, stateGridRows } from './stateGridLayout.ts';

const sixteen = range(16);

describe('stateGridRows', () => {
  it('maps the AES state column-major by default (cells[r + 4c] = s[r,c])', () => {
    const rows = stateGridRows(sixteen, AES_STATE_SHAPE, AES_STATE_ORDER);
    expect(rows[0]).toEqual([0, 4, 8, 12]);
    expect(rows[3]).toEqual([3, 7, 11, 15]);
    rows.forEach((row, r) => row.forEach((cell, c) => expect(cell).toBe(r + 4 * c)));
  });

  it('supports row-major and non-square shapes', () => {
    expect(stateGridRows(range(6), [2, 3], 'row-major')).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(stateGridRows(range(6), [2, 3], 'col-major')).toEqual([
      [0, 2, 4],
      [1, 3, 5],
    ]);
  });

  it('rejects a cell count that does not fit the shape', () => {
    expect(() => stateGridRows(range(15), AES_STATE_SHAPE, AES_STATE_ORDER)).toThrow(
      /expected 16 cells/,
    );
  });
});

describe('range', () => {
  it('counts from zero', () => {
    expect(range(4)).toEqual([0, 1, 2, 3]);
    expect(range(0)).toEqual([]);
  });
});
