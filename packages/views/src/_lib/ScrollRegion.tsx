import { useRef, type ReactNode, type RefObject } from 'react';
import { useScrollFocusable } from '@cryventure/viz';

export interface ScrollRegionProps {
  /** Accessible name of the region (already translated). */
  label: string;
  className: string;
  children: ReactNode;
  /** The scroller element, for callers that also scroll it themselves (e.g. to reveal the current row). */
  ref?: RefObject<HTMLDivElement | null>;
}

/**
 * A named scroll region (`role="region"`) that is in the tab order while its content overflows, so
 * it can be scrolled from the keyboard (WCAG 2.1.1), and out of it once measured as fitting.
 */
export function ScrollRegion({ label, className, children, ref }: ScrollRegionProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const scrollerRef = ref ?? ownRef;
  const focusable = useScrollFocusable(scrollerRef);
  return (
    <div ref={scrollerRef} className={className} role="region" tabIndex={focusable ? 0 : undefined} aria-label={label}>
      {children}
    </div>
  );
}
