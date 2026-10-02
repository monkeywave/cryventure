import { useMemo } from 'react';
import { DEFAULT_VARIANT, facetKey, getFacet, type FacetKey, type FacetKind, type TraceBundle } from '@cryventure/core';
import { useLab } from './LabContext.tsx';

export type FacetResult<T> =
  | { status: 'ready'; data: T }
  | { status: 'missing'; data: undefined }
  | { status: 'loading'; data: undefined };

/**
 * Bundle facets first, then the derived-facet cache (filled lazily by derivers later).
 * `loading` until a bundle exists; `missing` when neither source has the facet.
 */
export function lookupFacet<T>(
  bundle: TraceBundle | null,
  derived: Partial<Record<FacetKey, unknown>>,
  kind: FacetKind,
  variant: string = DEFAULT_VARIANT,
): FacetResult<T> {
  if (bundle === null) return { status: 'loading', data: undefined };
  const data = getFacet<T>(bundle, kind, variant) ?? (derived[facetKey(kind, variant)] as T | undefined);
  return data === undefined ? { status: 'missing', data: undefined } : { status: 'ready', data };
}

/** A facet of the current lab's bundle; the caller asserts its type. */
export function useFacet<T>(kind: FacetKind, variant: string = DEFAULT_VARIANT): FacetResult<T> {
  const bundle = useLab((state) => state.bundle);
  const derived = useLab((state) => state.derivedFacets);
  return useMemo(() => lookupFacet<T>(bundle, derived, kind, variant), [bundle, derived, kind, variant]);
}
