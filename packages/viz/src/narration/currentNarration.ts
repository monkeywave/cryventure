import { narrationAt, type I18nRef, type NarrationFacet } from '@cryventure/core';
import { INITIAL_STEP } from '../lab/labReducers.ts';
import type { FacetResult } from '../lab/useFacet.ts';

export const NARRATION_KEYS = {
  initial: 'ui.narration.initial',
  none: 'ui.narration.none',
  missing: 'ui.narration.missing',
} as const;

export interface NarrationInput {
  facet: FacetResult<NarrationFacet>;
  step: number;
  /** The active beat's narration (story mode only); it replaces the step narration. */
  beatNarration?: I18nRef;
}

/**
 * What the lab narrates right now: a hint at the initial state, the beat's (story) or step's
 * narration, or a fallback when the lab has no narration or the step has none.
 */
export function currentNarrationRef({ facet, step, beatNarration }: NarrationInput): I18nRef {
  if (facet.status === 'missing') return { key: NARRATION_KEYS.missing };
  if (step === INITIAL_STEP) return { key: NARRATION_KEYS.initial };
  const ref = beatNarration ?? (facet.data === undefined ? undefined : narrationAt(facet.data, step));
  return ref ?? { key: NARRATION_KEYS.none };
}
