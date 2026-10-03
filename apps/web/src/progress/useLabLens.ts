import { useSyncExternalStore } from 'react';
import type { Lens } from '@cryventure/core';
import { readDocumentLens, subscribeDocumentLens } from './documentLens.ts';
import { DEFAULT_LENS, resolveLabLens } from './lens.ts';

const serverLens = (): Lens => DEFAULT_LENS;

/** The page lens from `<html data-lens>`, live; the server (and hydration) snapshot is the default lens. */
export function useDocumentLens(): Lens {
  return useSyncExternalStore(subscribeDocumentLens, readDocumentLens, serverLens);
}

/**
 * The lens a lab island shows: `pinned` (from `<Lab lens>`) wins; otherwise it follows the page lens
 * live, matching it right after hydration.
 */
export function useLabLens(pinned: Lens | undefined): Lens {
  return resolveLabLens(pinned, useDocumentLens());
}
