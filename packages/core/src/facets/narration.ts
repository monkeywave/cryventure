import type { I18nRef } from '../i18n.ts';
import type { StateFacet } from './state.ts';
import { INITIAL_STEP_INDEX } from './validation.ts';

export interface NarrationEntry {
  step: number;
  ref: I18nRef;
}

export interface NarrationFacet {
  kind: 'narration';
  schemaVersion: 1;
  /** Sorted by ascending step; the first entry may be step −1 (the initial state). */
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
 * Narration for exactly `step` (−1 = the initial state), or `undefined` if none was recorded. O(1)
 * when entries are dense (one per step, optionally preceded by a step −1 entry, as
 * `narrationFromState` builds them), else a binary search.
 */
export function narrationAt(facet: NarrationFacet, step: number): I18nRef | undefined {
  const offset = facet.entries[0]?.step === INITIAL_STEP_INDEX ? 1 : 0;
  const direct = facet.entries[step + offset];
  if (direct?.step === step) return direct.ref;
  return findEntry(facet.entries, step)?.ref;
}

/**
 * Derives a narration facet from the per-step narration refs of a state facet, preceded by a step −1
 * entry when the state facet has an `initialNarration`.
 */
export function narrationFromState(state: Pick<StateFacet<string, { op: string }>, 'steps' | 'initialNarration'>): NarrationFacet {
  const initial = state.initialNarration === undefined ? [] : [{ step: INITIAL_STEP_INDEX, ref: state.initialNarration }];
  const steps = state.steps.map((step, index) => ({ step: index, ref: step.narration }));
  return { kind: 'narration', schemaVersion: 1, entries: [...initial, ...steps] };
}
