import { getFacet, type NarrationFacet, type StateFacet, type TraceBundle } from '@cryventure/core';

/**
 * Number of steps on the lab's shared timeline: the state facet's step count, else one past
 * the last narration step, else 0. Steps run from -1 (initial) to length - 1.
 */
export function timelineLength(bundle: TraceBundle | null): number {
  if (bundle === null) return 0;
  const state = getFacet<StateFacet<string, { op: string }>>(bundle, 'state');
  if (state !== undefined) return state.steps.length;
  const narration = getFacet<NarrationFacet>(bundle, 'narration');
  const lastStep = narration?.entries.at(-1)?.step;
  return lastStep === undefined ? 0 : lastStep + 1;
}
