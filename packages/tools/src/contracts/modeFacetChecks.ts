import { chainIssues, chainLabelRefs, getFacet, wireIssues, wireLabelRefs, type AnyStateFacet, type ChainFacet, type I18nRef, type TraceBundle, type WireFacet } from '@cryventure/core';

/** Contract checks for the block-mode facets `chain` and `wire` (docs/M3.md §6), when a bundle emits them. */

function stateStepCount(bundle: TraceBundle): number {
  return getFacet<AnyStateFacet>(bundle, 'state')?.steps.length ?? 0;
}

/** Structural issues of the bundle's chain and wire facets, against its state facet's step count. */
export function modeFacetIssues(bundle: TraceBundle): string[] {
  const steps = stateStepCount(bundle);
  const chain = getFacet<ChainFacet>(bundle, 'chain');
  const wire = getFacet<WireFacet>(bundle, 'wire');
  return [...(chain === undefined ? [] : chainIssues(chain, steps)), ...(wire === undefined ? [] : wireIssues(wire, steps))];
}

/** Every label ref the bundle's chain and wire facets render. */
export function modeFacetRefs(bundle: TraceBundle): I18nRef[] {
  const chain = getFacet<ChainFacet>(bundle, 'chain');
  const wire = getFacet<WireFacet>(bundle, 'wire');
  return [...(chain === undefined ? [] : chainLabelRefs(chain)), ...(wire === undefined ? [] : wireLabelRefs(wire))];
}
