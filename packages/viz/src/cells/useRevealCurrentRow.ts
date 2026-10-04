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

/**
 * The nearest `scrollTop` that shows `row` (unchanged when it is in view; a too-tall row aligns its
 * top). `headerOffset`: the height of a sticky header covering the top of the view.
 */
export function revealScrollTop(view: ScrollView, row: RowBox, headerOffset = 0): number {
  const visibleTop = view.scrollTop + headerOffset;
  const visibleHeight = view.clientHeight - headerOffset;
  if (row.top < visibleTop || row.height > visibleHeight) return row.top - headerOffset;
  if (row.top + row.height > visibleTop + visibleHeight) return row.top + row.height - view.clientHeight;
  return view.scrollTop;
}

/**
 * Scrolls `row` into view inside `scroller` only, by setting its `scrollTop`: the page never moves.
 * The jump is instant, so it honours reduced motion. `headerOffset` as in `revealScrollTop`.
 */
export function revealInScroller(scroller: HTMLElement, row: HTMLElement, headerOffset = 0): void {
  const box = row.getBoundingClientRect();
  const top = box.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTop = revealScrollTop(scroller, { top, height: box.height }, headerOffset);
}

const CURRENT_ROW = ':scope > .cv-grid__row[data-current]';

/**
 * Keeps the current row (`data-current`, e.g. the schedule word just written) visible inside the
 * grid's own vertical scroller. Only the grid scrolls, never the page; a grid that fits does nothing.
 * Re-runs when the current row index changes (not on every step), so a reader's own scrolling stays
 * put while the current row does.
 */
export function useRevealCurrentRow(ref: RefObject<HTMLElement | null>, currentRow: number): void {
  useEffect(() => {
    const grid = ref.current;
    const row = currentRow < 0 ? null : grid?.querySelector<HTMLElement>(CURRENT_ROW);
    if (grid == null || row == null || grid.scrollHeight <= grid.clientHeight) return;
    revealInScroller(grid, row);
  }, [ref, currentRow]);
}
