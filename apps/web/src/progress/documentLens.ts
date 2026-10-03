import type { Lens } from '@cryventure/core';
import { DEFAULT_LENS, isLens } from './lens.ts';

/**
 * The page lens as `<html data-lens>` shows it: the single source of truth for islands. The head
 * script sets it before first paint and the header selector keeps it in sync with stored progress.
 */
export function readDocumentLens(): Lens {
  if (typeof document === 'undefined') return DEFAULT_LENS;
  const lens = document.documentElement.dataset.lens;
  return isLens(lens) ? lens : DEFAULT_LENS;
}

/** Calls `listener` whenever `<html data-lens>` changes; returns the unsubscribe function. */
export function subscribeDocumentLens(listener: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lens'] });
  return () => observer.disconnect();
}
