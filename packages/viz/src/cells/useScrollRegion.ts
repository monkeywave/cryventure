import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Scroll regions: one overflow-measuring core shared by the edge flags (ByteGrid's fade) and the
 * keyboard focusability of view scrollers. It measures once on mount (before paint) and then only
 * when the region or its content box resizes (ResizeObserver; a viewport resize resizes the region)
 * or, for the edge flags, scrolls. Never on every commit: that forced layout of long listings on
 * each step and hover.
 */

type ScrollBox = Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'scrollHeight' | 'clientHeight'>;

/** Whether the content is wider or taller than the box (either axis scrolls). */
export function overflowsBox(element: ScrollBox): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

/** Whether content hides past the start / end edge of a horizontal scroller (1px tolerance for subpixels). */
export function scrollEdges({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: Pick<HTMLElement, 'scrollLeft' | 'scrollWidth' | 'clientWidth'>): {
  start: boolean;
  end: boolean;
} {
  return { start: scrollLeft > 1, end: scrollLeft + clientWidth < scrollWidth - 1 };
}

/** Whether content hides above / below the edges of a vertical scroller (1px tolerance for subpixels). */
export function blockScrollEdges({
  scrollTop,
  scrollHeight,
  clientHeight,
}: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>): {
  top: boolean;
  bottom: boolean;
} {
  return { top: scrollTop > 1, bottom: scrollTop + clientHeight < scrollHeight - 1 };
}

interface MeasureOptions {
  /** Also re-measure on scroll (the edge flags depend on the scroll position). */
  onScroll?: boolean;
  /** Re-subscribes (and re-measures) when it changes. */
  contentKey?: unknown;
}

/**
 * Calls `measure` synchronously after mount (a layout effect: before the first paint), then on every
 * resize of the element or of its first child (the content box), and on scroll when asked.
 * `measure` must be stable.
 */
function useOverflowMeasure(ref: RefObject<HTMLElement | null>, measure: (element: HTMLElement) => void, { onScroll = false, contentKey }: MeasureOptions = {}): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const update = () => measure(element);
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined;
    observer?.observe(element);
    if (element.firstElementChild !== null) observer?.observe(element.firstElementChild);
    if (onScroll) element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer?.disconnect();
      if (onScroll) element.removeEventListener('scroll', update);
    };
  }, [ref, measure, onScroll, contentKey]);
}

const setFlag = (element: HTMLElement, name: string, on: boolean) => (on ? element.setAttribute(name, '') : element.removeAttribute(name));

function markEdges(element: HTMLElement): void {
  const { start, end } = scrollEdges(element);
  setFlag(element, 'data-overflow-start', start);
  setFlag(element, 'data-overflow-end', end);
  const { top, bottom } = blockScrollEdges(element);
  setFlag(element, 'data-overflow-top', top);
  setFlag(element, 'data-overflow-bottom', bottom);
}

/**
 * Marks the element behind `ref` with `data-overflow-start` / `-end` (inline) and `data-overflow-top`
 * / `-bottom` (block) while content hides past that edge, so CSS can fade the edge (a scroll
 * affordance). Writes the attributes directly: no re-render on scroll. Re-measures on scroll, on
 * resize and when `contentKey` changes.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, contentKey: unknown): void {
  useOverflowMeasure(ref, markEdges, { onScroll: true, contentKey });
}

/**
 * Whether a scroll region overflows, so it needs `tabIndex={0}` for keyboard scrolling
 * (WCAG 2.1.1); a region that fits stays out of the tab order.
 *
 * Focusable until measured: the first render (and the server HTML) says `true`, so an overflowing
 * region is never briefly unreachable. The mount measurement runs in a layout effect, before paint,
 * and drops it from the tab order only once it is seen to fit; resizes of the region or its content
 * re-check.
 */
export function useScrollFocusable(ref: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(true);
  const measure = useCallback((element: HTMLElement) => setOverflows(overflowsBox(element)), []);
  useOverflowMeasure(ref, measure);
  return overflows;
}
