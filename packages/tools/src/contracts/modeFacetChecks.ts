import {
  chainIssues,
  chainLabelRefs,
  getFacet,
  isWireSegmentAvailable,
  wireIssues,
  wireLabelRefs,
  type AnyStateFacet,
  type ChainFacet,
  type I18nRef,
  type TraceBundle,
  type ValuesFacet,
  type WireFacet,
  type WireSegment,
} from '@cryventure/core';

/** Contract checks for the block-mode facets `chain` and `wire` (docs/M3.md §6), when a bundle emits them. */

function stateStepCount(bundle: TraceBundle): number {
  return getFacet<AnyStateFacet>(bundle, 'state')?.steps.length ?? 0;
}

/** Chain node and wire segment `valueRef`s that name no value of the bundle's values facet. */
function valueRefIssues(chain: ChainFacet | undefined, wire: WireFacet | undefined, values: ValuesFacet | undefined): string[] {
  const ids = new Set(values?.values.map((value) => value.id) ?? []);
  const missing = (valueRef: string | undefined) => valueRef !== undefined && !ids.has(valueRef);
  const nodes = (chain?.nodes ?? []).filter((node) => missing(node.valueRef)).map((node) => `chain: node "${node.id}" valueRef "${node.valueRef}" is not in the values facet`);
  const segments = (wire?.segments ?? [])
    .filter((segment) => missing(segment.valueRef))
    .map((segment) => `wire: segment "${segment.id}" valueRef "${segment.valueRef}" is not in the values facet`);
  return [...nodes, ...segments];
}

/** The segment of each global byte offset (over the concatenated segments). */
function segmentByOffset(wire: WireFacet): WireSegment[] {
  return wire.segments.flatMap((segment) => segment.bytes.map(() => segment));
}

/** Wire highlights on bytes whose segment has not been sent yet at that step. */
function unavailableHighlightIssues(wire: WireFacet): string[] {
  const segments = segmentByOffset(wire);
  return (wire.activeAt ?? []).flatMap(({ step, offsets }) =>
    offsets.flatMap((offset) => {
      const segment = segments[offset];
      if (segment === undefined || isWireSegmentAvailable(segment, step)) return [];
      return [`wire: activeAt step ${step} highlights offset ${offset} of segment "${segment.id}", available only from step ${segment.availableAt}`];
    }),
  );
}

/** A chain node linked to a wire segment (`segmentId`) gets its value when that segment is sent (where the wire says when). */
function segmentTimingIssues(chain: ChainFacet, wire: WireFacet): string[] {
  const segmentById = new Map(wire.segments.map((segment) => [segment.id, segment]));
  return chain.nodes.flatMap((node) => {
    if (node.segmentId === undefined) return [];
    const segment = segmentById.get(node.segmentId);
    if (segment === undefined) return [`chain: node "${node.id}" segmentId "${node.segmentId}" is not a wire segment`];
    if (segment.availableAt === undefined || segment.availableAt === node.activeAt) return [];
    return [`chain: node "${node.id}" activeAt ${node.activeAt} differs from wire segment "${segment.id}" availableAt ${segment.availableAt}`];
  });
}

/** Structural issues of the bundle's chain and wire facets, against its state facet's step count and values facet. */
export function modeFacetIssues(bundle: TraceBundle): string[] {
  const steps = stateStepCount(bundle);
  const chain = getFacet<ChainFacet>(bundle, 'chain');
  const wire = getFacet<WireFacet>(bundle, 'wire');
  if (chain === undefined && wire === undefined) return [];
  return [
    ...(chain === undefined ? [] : chainIssues(chain, steps)),
    ...(wire === undefined ? [] : [...wireIssues(wire, steps), ...unavailableHighlightIssues(wire)]),
    ...valueRefIssues(chain, wire, getFacet<ValuesFacet>(bundle, 'values')),
    ...(chain === undefined || wire === undefined ? [] : segmentTimingIssues(chain, wire)),
  ];
}

/** Every label ref the bundle's chain and wire facets render. */
export function modeFacetRefs(bundle: TraceBundle): I18nRef[] {
  const chain = getFacet<ChainFacet>(bundle, 'chain');
  const wire = getFacet<WireFacet>(bundle, 'wire');
  return [...(chain === undefined ? [] : chainLabelRefs(chain)), ...(wire === undefined ? [] : wireLabelRefs(wire))];
}
