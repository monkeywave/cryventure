import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { moveUnitFocus, type UnitPosition } from './memoryModel.ts';

/**
 * Roving tabindex over hex rows whose unit counts differ (bytes, or u32 words): one tabbable unit,
 * arrow/Home/End keys move focus (and stay out of the lab's shortcuts), as viz `useGridNavigation`.
 */
export function useUnitNavigation(rowLengths: readonly number[]) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<UnitPosition>({ row: 0, col: 0 });
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const next = moveUnitFocus(active, event.key, rowLengths);
      if (next === null) return;
      event.preventDefault();
      setActive(next);
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-row="${next.row}"][data-col="${next.col}"]`)
        ?.focus();
    },
    [active, rowLengths],
  );
  // A toggle that shortens the rows (u32 words) keeps one unit tabbable.
  const tabbable = {
    row: Math.min(active.row, rowLengths.length - 1),
    col: Math.min(active.col, (rowLengths[Math.min(active.row, rowLengths.length - 1)] ?? 1) - 1),
  };
  const isActive = (row: number, col: number) => row === tabbable.row && col === tabbable.col;
  return { gridRef, onKeyDown, isActive, setActive };
}
