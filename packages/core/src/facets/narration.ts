import type { I18nRef } from '../i18n.ts';
import type { StateFacet } from './state.ts';

export interface NarrationEntry {
  step: number;
  ref: I18nRef;
}

export interface NarrationFacet {
  kind: 'narration';
  schemaVersion: 1;
  /** Sorted by ascending step. */
  entries: NarrationEntry[];
}

/** Binary search over entries sorted by ascending step. */
function findEntry(entries: readonly NarrationEntry[], step: number): NarrationEntry | undefined {
  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const entry = entries[mid]!;
    if (entry.step === step) return entry;
    if (entry.step < step) low = mid + 1;
    else high = mid - 1;
  }
  return undefined;
}

/**
 * Narration for exactly `step`, or `undefined` if none was recorded. O(1) when entries are dense
 * (`entries[step].step === step`, as `narrationFromState` builds them), else a binary search.
 */
export function narrationAt(facet: NarrationFacet, step: number): I18nRef | undefined {
  const direct = facet.entries[step];
  if (direct?.step === step) return direct.ref;
  return findEntry(facet.entries, step)?.ref;
}

/** Derives a narration facet from the per-step narration refs of a state facet. */
export function narrationFromState(state: Pick<StateFacet<string, { op: string }>, 'steps'>): NarrationFacet {
  return {
    kind: 'narration',
    schemaVersion: 1,
    entries: state.steps.map((step, index) => ({ step: index, ref: step.narration })),
  };
}
