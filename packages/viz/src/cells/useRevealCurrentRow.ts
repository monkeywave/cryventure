import { useEffect, type RefObject } from 'react';

/** Visible window of a vertical scroller. */
export interface ScrollView {
  scrollTop: number;
  clientHeight: number;
}

/** A row's position inside the scroller's content (from its top edge). */
export interface RowBox {
  top: number;
  height: number;
}

/** The nearest `scrollTop` that shows `row` (unchanged when it is in view; a too-tall row aligns its top). */
export function revealScrollTop(view: ScrollView, row: RowBox): number {
  const viewBottom = view.scrollTop + view.clientHeight;
  if (row.top < view.scrollTop || row.height > view.clientHeight) return row.top;
  if (row.top + row.height > viewBottom) return row.top + row.height - view.clientHeight;
  return view.scrollTop;
}

const CURRENT_ROW = ':scope > .cv-grid__row[data-current]';

/**
 * Keeps the current row (`data-current`, e.g. the schedule word just written) visible inside the
 * grid's own vertical scroller. Only the grid scrolls, never the page; a grid that fits does nothing.
 * Re-runs when `currentKey` changes.
 */
export function useRevealCurrentRow(ref: RefObject<HTMLElement | null>, currentKey: unknown): void {
  useEffect(() => {
    const grid = ref.current;
    const row = grid?.querySelector<HTMLElement>(CURRENT_ROW);
    if (grid == null || row == null || grid.scrollHeight <= grid.clientHeight) return;
    const top = row.getBoundingClientRect().top - grid.getBoundingClientRect().top + grid.scrollTop;
    grid.scrollTop = revealScrollTop(grid, { top, height: row.offsetHeight });
  }, [ref, currentKey]);
}
