import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react';

/** Below this container width (px) the workspace stacks its panels vertically. */
export const COMPACT_BREAKPOINT_PX = 720;

/** `true` only for a measured, non-zero width under the breakpoint (unmeasured stays wide). */
export function isCompactWidth(width: number | undefined, breakpoint: number = COMPACT_BREAKPOINT_PX): boolean {
  return width !== undefined && width > 0 && width < breakpoint;
}

function observeWidth(element: Element, onWidth: (width: number) => void): () => void {
  onWidth(element.getBoundingClientRect().width);
  if (typeof ResizeObserver !== 'function') return () => {};
  const observer = new ResizeObserver((entries) => {
    const entry = entries.at(-1);
    if (entry !== undefined) onWidth(entry.contentRect.width);
  });
  observer.observe(element);
  return () => observer.disconnect();
}

/** Tracks an element's own (container) width via ResizeObserver; attach the returned ref. */
export function useContainerWidth<T extends Element>(): [RefCallback<T>, number | undefined] {
  const [width, setWidth] = useState<number | undefined>(undefined);
  const stopRef = useRef<() => void>(() => {});
  const ref = useCallback((element: T | null) => {
    stopRef.current();
    stopRef.current = element === null ? () => {} : observeWidth(element, setWidth);
  }, []);
  useEffect(() => () => stopRef.current(), []);
  return [ref, width];
}
