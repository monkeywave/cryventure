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

/** Narration for exactly `step`, or `undefined` if none was recorded. */
export function narrationAt(facet: NarrationFacet, step: number): I18nRef | undefined {
  return facet.entries.find((entry) => entry.step === step)?.ref;
}

/** Derives a narration facet from the per-step narration refs of a state facet. */
export function narrationFromState(state: Pick<StateFacet<string, { op: string }>, 'steps'>): NarrationFacet {
  return {
    kind: 'narration',
    schemaVersion: 1,
    entries: state.steps.map((step, index) => ({ step: index, ref: step.narration })),
  };
}
