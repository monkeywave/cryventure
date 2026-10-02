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

/** Observes the element behind the returned ref; `onWidth` must be stable. Stops on detach/unmount. */
function useWidthObserver<T extends Element>(onWidth: (width: number) => void): RefCallback<T> {
  const stopRef = useRef<() => void>(() => {});
  const ref = useCallback(
    (element: T | null) => {
      stopRef.current();
      stopRef.current = element === null ? () => {} : observeWidth(element, onWidth);
    },
    [onWidth],
  );
  useEffect(() => () => stopRef.current(), []);
  return ref;
}

/** Tracks an element's own (container) width via ResizeObserver; attach the returned ref. */
export function useContainerWidth<T extends Element>(): [RefCallback<T>, number | undefined] {
  const [width, setWidth] = useState<number | undefined>(undefined);
  return [useWidthObserver<T>(setWidth), width];
}

/**
 * `true` while the element behind the returned ref is narrower than the breakpoint. Only the
 * boolean is state, so resizes within one side of the breakpoint never re-render (no layout thrash);
 * unmeasured (SSR, first render) counts as wide.
 */
export function useCompactContainer<T extends Element>(breakpoint: number = COMPACT_BREAKPOINT_PX): [RefCallback<T>, boolean] {
  const [compact, setCompact] = useState(false);
  const onWidth = useCallback((width: number) => setCompact(isCompactWidth(width, breakpoint)), [breakpoint]);
  return [useWidthObserver<T>(onWidth), compact];
}
