import { useLayoutEffect, useState, type RefObject } from 'react';

/** Rounding slack (px) between `scrollHeight` and `clientHeight` before text counts as cut off. */
const CLAMP_TOLERANCE_PX = 1;

export function isClamped(element: Pick<HTMLElement, 'scrollHeight' | 'clientHeight'>): boolean {
  return element.scrollHeight - element.clientHeight > CLAMP_TOLERANCE_PX;
}

/** Whether the element's (line-clamped) content is cut off; re-measured whenever `content` changes. */
export function useIsClamped(ref: RefObject<HTMLElement | null>, content: string): boolean {
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    if (ref.current !== null) setClamped(isClamped(ref.current));
  }, [ref, content]);
  return clamped;
}
