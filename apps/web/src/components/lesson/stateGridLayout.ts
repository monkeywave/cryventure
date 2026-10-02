import { cellIndex, type GridShape } from '@cryventure/viz';

/** Fill order of a grid's cells, as `cellIndex` takes it. */
export type GridOrder = NonNullable<Parameters<typeof cellIndex>[3]>;

/** The AES state: 4×4, filled column-major (FIPS 197 §3.4: in[r + 4c] → s[r,c]). */
export const AES_STATE_SHAPE: GridShape = [4, 4];
export const AES_STATE_ORDER: GridOrder = 'col-major';

/** Visual rows of a grid: rows[r][c] is the cell shown at (r, c) for the given fill order. */
export function stateGridRows<T>(cells: readonly T[], shape: GridShape, order: GridOrder): T[][] {
  const [rows, cols] = shape;
  if (cells.length !== rows * cols) {
    throw new RangeError(
      `<StateGrid>: expected ${rows * cols} cells for a ${rows}×${cols} grid, got ${cells.length}`,
    );
  }
  return range(rows).map((row) =>
    range(cols).map((col) => cells[cellIndex(row, col, shape, order)] as T),
  );
}

export function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}
