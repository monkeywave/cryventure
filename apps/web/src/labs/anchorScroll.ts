import { headingAnchor } from './deepLink.ts';

const RESTORED_NAVIGATIONS = new Set(['reload', 'back_forward']);

/** Reload and back/forward restore the previous scroll position, as they do for a plain heading hash. */
function isScrollRestored(win: Window): boolean {
  const [entry] = win.performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry !== undefined && RESTORED_NAVIGATIONS.has(entry.type);
}

/**
 * Does for a combined `#<heading>&lab=…` hash what the browser does for `#<heading>`: scrolls the
 * heading into view on a fresh navigation (the browser finds no element named by the whole fragment).
 */
export function scrollToHeadingAnchor(win: Window = window): void {
  const id = headingAnchor(win.location.hash);
  if (id === undefined || isScrollRestored(win)) return;
  win.document.getElementById(id)?.scrollIntoView();
}
