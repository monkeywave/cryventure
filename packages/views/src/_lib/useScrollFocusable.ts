import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

type ScrollBox = Pick<HTMLElement, 'scrollWidth' | 'clientWidth' | 'scrollHeight' | 'clientHeight'>;

/** Whether the content is wider or taller than the box (either axis scrolls). */
export function overflowsBox(element: ScrollBox): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

/**
 * Whether a scroll region overflows, so it needs `tabIndex={0}` for keyboard scrolling
 * (WCAG 2.1.1); a region that fits stays out of the tab order.
 *
 * Focusable until measured: the first render (and the server HTML) says `true`, so an overflowing
 * region is never briefly unreachable. The layout effect measures after every commit, before paint,
 * and drops it from the tab order only once it is seen to fit; resize and content-box changes re-check.
 */
export function useScrollFocusable(ref: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(true);
  useLayoutEffect(() => {
    if (ref.current !== null) setOverflows(overflowsBox(ref.current));
  });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const check = () => setOverflows(overflowsBox(element));
    window.addEventListener('resize', check);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(check);
    observer?.observe(element);
    if (element.firstElementChild !== null) observer?.observe(element.firstElementChild);
    return () => {
      window.removeEventListener('resize', check);
      observer?.disconnect();
    };
  }, [ref]);
  return overflows;
}
