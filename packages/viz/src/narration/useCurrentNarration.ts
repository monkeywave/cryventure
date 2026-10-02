import type { I18nRef, NarrationFacet } from '@cryventure/core';
import { useActiveBeat, useChoreography } from '../choreography/ChoreographyContext.tsx';
import { useT } from '../i18n/I18nProvider.tsx';
import { useLab } from '../lab/LabContext.tsx';
import { useFacet } from '../lab/useFacet.ts';
import { currentNarrationRef } from './currentNarration.ts';

/** In story mode the active beat's narration (when it has one) replaces the step narration. */
function useBeatNarration(): I18nRef | undefined {
  const story = useLab((state) => state.mode === 'story');
  const beat = useActiveBeat(useChoreography());
  return story ? beat?.narration : undefined;
}

/**
 * The lab's current narration, translated: the single source for every place that narrates
 * (the narration view on wide labs, the caption bar on narrow ones).
 */
export function useCurrentNarration(): string {
  const t = useT();
  const facet = useFacet<NarrationFacet>('narration');
  const step = useLab((state) => state.step);
  const beatNarration = useBeatNarration();
  return t(currentNarrationRef({ facet, step, beatNarration }));
}
