import { useMemo } from 'react';
import type { FacetKind } from '@cryventure/core';
import { useLab } from './LabContext.tsx';
import { useChosenVariant } from './useFacet.ts';

/** One view's variant picker state, shared lab-wide through the store's `preferredVariants`. */
export interface FacetVariantChoice {
  /** Variants of the kind, bundle first, derived ones in deriver order. */
  variants: string[];
  /**
   * The variant shown: the first preferred one the kind has, else the closest name to the latest
   * preference, else `default`, else the first; `undefined` while a running deriver could change it.
   */
  current: string | undefined;
  /** Records `variant` as the lab's preferred variant; views of other kinds with that variant follow. */
  choose: (variant: string) => void;
}

/** Lab-wide variant choice for `kind` (docs/M4.md §1f): one picker switches every view sharing the variant name. */
export function useVariantChoice(kind: FacetKind): FacetVariantChoice {
  const { variants, current } = useChosenVariant(kind);
  const choose = useLab((state) => state.preferVariant);
  return useMemo(() => ({ variants, current, choose }), [variants, current, choose]);
}
