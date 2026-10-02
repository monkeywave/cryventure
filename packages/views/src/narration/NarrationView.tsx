import { narrationAt, type I18nRef, type NarrationFacet } from '@cryventure/core';
import { INITIAL_STEP, useActiveBeat, useChoreography, useFacet, useLab, useScopeLabel, useT, type ViewProps } from '@cryventure/viz';

/** In story mode the active beat's narration (when it has one) replaces the step narration. */
function useBeatNarration(): I18nRef | undefined {
  const story = useLab((state) => state.mode === 'story');
  const beat = useActiveBeat(useChoreography());
  return story ? beat?.narration : undefined;
}

function useNarrationText(facet: NarrationFacet | undefined): string {
  const t = useT();
  const step = useLab((state) => state.step);
  const beatNarration = useBeatNarration();
  if (step === INITIAL_STEP) return t('view.narration.initial');
  const ref = beatNarration ?? (facet === undefined ? undefined : narrationAt(facet, step));
  return ref === undefined ? t('view.narration.none') : t(ref);
}

/** The current step's (story mode: beat's) translated narration, announced politely, under its scope path. */
export default function NarrationView(_props: ViewProps) {
  const t = useT();
  const narration = useFacet<NarrationFacet>('narration');
  const scope = useScopeLabel();
  const text = useNarrationText(narration.data);

  return (
    <section className="cv-narration-view" aria-label={t('view.narration.title')}>
      {scope !== '' && <p className="cv-narration__scope">{scope}</p>}
      <p className="cv-narration" aria-live="polite" aria-atomic="true">
        {narration.status === 'missing' ? t('view.narration.missing') : text}
      </p>
    </section>
  );
}
