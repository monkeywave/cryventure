import type { TableFacet, TableMark } from '@cryventure/core';

/**
 * Pure helpers of the lookup-table view: hex formatting of inputs (indices) and outputs (entries),
 * and the row / column header labels.
 */

/** Hex digits needed to write every index of a `size`-entry table (2 for the 256-entry S-box). */
export function indexDigits(size: number): number {
  return Math.max(1, (Math.max(size, 1) - 1).toString(16).length);
}

/** Lowercase, zero-padded hex of `index` in a `size`-entry table: the value sent as the select param. */
export function indexToHex(index: number, size: number): string {
  return index.toString(16).padStart(indexDigits(size), '0');
}

/** Lowercase hex (the project-wide convention, `ed`), padded to `digits`. */
export function displayHex(value: number, digits = 2): string {
  return value.toString(16).padStart(digits, '0');
}

export interface TableHeaders {
  rows: string[];
  cols: string[];
}

function isPowerOf16(value: number): boolean {
  let rest = value;
  while (rest >= 16 && rest % 16 === 0) rest /= 16;
  return rest === 1 && value > 1;
}

/**
 * Header labels. When `cols` is a power of 16 each header is a nibble pattern of the index: row `5x`,
 * column `x3` (the S-box convention). Otherwise rows show their first index and columns `+n`.
 */
export function tableHeaders(rows: number, cols: number): TableHeaders {
  const total = indexDigits(rows * cols);
  if (isPowerOf16(cols)) {
    const colDigits = indexDigits(cols);
    const rowDigits = Math.max(total - colDigits, 1);
    return {
      rows: Array.from(
        { length: rows },
        (_, row) => displayHex(row, rowDigits) + 'x'.repeat(colDigits),
      ),
      cols: Array.from(
        { length: cols },
        (_, col) => 'x'.repeat(rowDigits) + displayHex(col, colDigits),
      ),
    };
  }
  return {
    rows: Array.from({ length: rows }, (_, row) => displayHex(row * cols, total)),
    cols: Array.from({ length: cols }, (_, col) => `+${displayHex(col, 1)}`),
  };
}

/** Marks grouped by cell index (a cell may carry several, e.g. input and fixed point). */
export function marksByIndex(
  marks: readonly TableMark[] | undefined,
): ReadonlyMap<number, TableMark[]> {
  const byIndex = new Map<number, TableMark[]>();
  for (const mark of marks ?? [])
    byIndex.set(mark.index, [...(byIndex.get(mark.index) ?? []), mark]);
  return byIndex;
}

/** One cell's input and output in display hex. */
export function cellHex(
  facet: Pick<TableFacet, 'entries'>,
  index: number,
): { input: string; output: string } {
  const size = facet.entries.length;
  return {
    input: displayHex(index, indexDigits(size)),
    output: displayHex(facet.entries[index] ?? 0),
  };
}
