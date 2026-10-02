import type { Lens } from '@cryventure/core';
import { resolveLabLens } from './lens.ts';
import { useProgress } from './useProgress.ts';

/**
 * The lens a lab island shows: `pinned` (from `<Lab lens>`) wins; otherwise it follows the page lens
 * live. During SSR and hydration it sees the default lens.
 */
export function useLabLens(pinned: Lens | undefined): Lens {
  const pageLens = useProgress((progress) => progress.lens);
  return resolveLabLens(pinned, pageLens);
}
