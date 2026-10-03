import { useMemo } from 'react';
import type { FacetKey, MemoryFacet, TraceBundle } from '@cryventure/core';
import { facetData, useFacet, useFacetVariants, useVariantFacets, type FacetResult } from '@cryventure/viz';
import type { MemoryVariant } from './memoryModel.ts';

export type MemoryVariantsResult =
  | { status: 'ready'; current: MemoryFacet; variants: MemoryVariant[] }
  | { status: Exclude<FacetResult<MemoryFacet>['status'], 'ready'> };

/** Every memory variant with data, from the bundle first, then the derived cache (variant order kept). */
export function resolveVariants(
  bundle: TraceBundle | null,
  derived: Partial<Record<FacetKey, unknown>>,
  names: readonly string[],
): MemoryVariant[] {
  return withData(names.map((variant) => ({ variant, data: facetData<MemoryFacet>(bundle, derived, 'memory', variant) })));
}

function withData(entries: readonly { variant: string; data: MemoryFacet | undefined }[]): MemoryVariant[] {
  return entries.flatMap(({ variant, data }) => (data === undefined ? [] : [{ variant, facet: data }]));
}

/**
 * The memory facet `useFacet` picks by default (`current`) plus all its variants, so the view can
 * build its pickers from facet metadata. Status as `useFacet('memory')` (it requests derivation).
 */
export function useMemoryVariants(): MemoryVariantsResult {
  const facet = useFacet<MemoryFacet>('memory');
  const names = useFacetVariants('memory');
  const facets = useVariantFacets<MemoryFacet>('memory', names);
  const variants = useMemo(() => withData(facets), [facets]);
  if (facet.status !== 'ready') return { status: facet.status };
  return { status: 'ready', current: facet.data, variants };
}
