import { hexDigits, type TableFacet } from '@cryventure/core';

/**
 * Pure helpers of the lookup-table view: hex of inputs (indices) and outputs (entries), and the
 * nibble row / column header labels.
 */

/** Hex digits needed to write every index of a `size`-entry table (2 for the 256-entry S-box). */
export function indexDigits(size: number): number {
  return Math.max(1, (Math.max(size, 1) - 1).toString(16).length);
}

export interface TableHeaders {
  rows: string[];
  cols: string[];
}

/**
 * Nibble-pattern header labels (the S-box convention): row `5x`, column `x3`. Expects `cols` to be a
 * power of 16, as every table producer emits (a column then covers whole low hex digits).
 */
export function tableHeaders(rows: number, cols: number): TableHeaders {
  const colDigits = indexDigits(cols);
  const rowDigits = Math.max(indexDigits(rows * cols) - colDigits, 1);
  return {
    rows: Array.from(
      { length: rows },
      (_, row) => hexDigits(row, rowDigits) + 'x'.repeat(colDigits),
    ),
    cols: Array.from(
      { length: cols },
      (_, col) => 'x'.repeat(rowDigits) + hexDigits(col, colDigits),
    ),
  };
}

/** One cell's input (also the value sent as the select param) and output, in lowercase hex. */
export interface CellHex {
  input: string;
  output: string;
}

/** One cell's input and output in display hex. */
export function cellHex(facet: Pick<TableFacet, 'entries'>, index: number): CellHex {
  return {
    input: hexDigits(index, indexDigits(facet.entries.length)),
    output: hexDigits(facet.entries[index] ?? 0, 2),
  };
}

/** `cellHex` of every cell, in index order (computed once per facet by the view). */
export function allCellHex(facet: Pick<TableFacet, 'entries'>): CellHex[] {
  return facet.entries.map((_, index) => cellHex(facet, index));
}
