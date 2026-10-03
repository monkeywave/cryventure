import { useEffect, type RefObject } from 'react';

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

const setFlag = (element: HTMLElement, name: string, on: boolean) =>
  on ? element.setAttribute(name, '') : element.removeAttribute(name);

/**
 * Marks the element behind `ref` with `data-overflow-start` / `data-overflow-end` while content hides
 * past that edge, so CSS can fade the edge (a scroll affordance). Writes the attributes directly: no
 * re-render on scroll. Re-measures on scroll, on resize and when `contentKey` changes.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, contentKey: unknown): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const update = () => {
      const { start, end } = scrollEdges(element);
      setFlag(element, 'data-overflow-start', start);
      setFlag(element, 'data-overflow-end', end);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined;
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref, contentKey]);
}
