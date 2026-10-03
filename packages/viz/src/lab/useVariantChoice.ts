import { useMemo } from 'react';
import type { FacetKind } from '@cryventure/core';
import { useLab } from './LabContext.tsx';
import { useShownFacet, type ShownFacet } from './useFacet.ts';

/** One view's variant picker state, shared lab-wide through the store's `preferredVariants`. */
export interface FacetVariantChoice<T = unknown> extends ShownFacet<T> {
  /** Records `variant` as the lab's preferred variant; views of other kinds with that variant id follow. */
  choose: (variant: string) => void;
}

/**
 * Lab-wide variant choice for `kind` (docs/M4.md §1f), from one subscription: the variants (bundle
 * first, derived ones in deriver order), the one shown (`current`: the most recent preferred id the
 * kind has, else `default`, else the first; `undefined` while a running deriver could change it), its
 * facet, and `choose`, which switches every view sharing the variant id.
 */
export function useVariantChoice<T = unknown>(kind: FacetKind): FacetVariantChoice<T> {
  const { variants, current, facet } = useShownFacet<T>(kind);
  const choose = useLab((state) => state.preferVariant);
  return useMemo(() => ({ variants, current, facet, choose }), [variants, current, facet, choose]);
}
