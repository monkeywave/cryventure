import type { HighlightKind } from '@cryventure/core';

export type GridOrder = 'row-major' | 'col-major';
export type GridShape = readonly [rows: number, cols: number];

/** Flat value index shown at visual (row, col). */
export function cellIndex(row: number, col: number, [rows, cols]: GridShape, order: GridOrder = 'row-major'): number {
  return order === 'col-major' ? col * rows + row : row * cols + col;
}

export interface GridHighlight {
  indices: readonly number[];
  kind: HighlightKind;
}

/** Flat value index → highlight kind (later highlights win). */
export function highlightMap(highlights: readonly GridHighlight[]): ReadonlyMap<number, HighlightKind> {
  const byIndex = new Map<number, HighlightKind>();
  for (const highlight of highlights) highlight.indices.forEach((index) => byIndex.set(index, highlight.kind));
  return byIndex;
}

export interface GridPosition {
  row: number;
  col: number;
}

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

/** Grid keyboard model (WAI-ARIA grid): arrows move, Home/End jump within the row; `null` = not a grid key. */
export function moveGridFocus(position: GridPosition, key: string, [rows, cols]: GridShape): GridPosition | null {
  const { row, col } = position;
  switch (key) {
    case 'ArrowUp':
      return { row: clamp(row - 1, rows - 1), col };
    case 'ArrowDown':
      return { row: clamp(row + 1, rows - 1), col };
    case 'ArrowLeft':
      return { row, col: clamp(col - 1, cols - 1) };
    case 'ArrowRight':
      return { row, col: clamp(col + 1, cols - 1) };
    case 'Home':
      return { row, col: 0 };
    case 'End':
      return { row, col: cols - 1 };
    default:
      return null;
  }
}
