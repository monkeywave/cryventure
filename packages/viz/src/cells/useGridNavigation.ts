import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { moveGridFocus, type GridPosition, type GridShape } from './gridLayout.ts';

/** Roving tabindex for a grid: one tabbable cell, arrow keys move focus (and stay out of the lab's shortcuts). */
export function useGridNavigation(shape: GridShape) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<GridPosition>({ row: 0, col: 0 });

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const next = moveGridFocus(active, event.key, shape);
      if (next === null) return;
      event.preventDefault();
      setActive(next);
      gridRef.current?.querySelector<HTMLElement>(`[data-row="${next.row}"][data-col="${next.col}"]`)?.focus();
    },
    [active, shape],
  );

  const isActive = (row: number, col: number) => row === active.row && col === active.col;
  return { gridRef, onKeyDown, isActive, setActive };
}
