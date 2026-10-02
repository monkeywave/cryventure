import { narrationAt, type NarrationFacet } from '@cryventure/core';
import { INITIAL_STEP, useFacet, useLab, useScopeLabel, useT, type ViewProps } from '@cryventure/viz';

function useNarrationText(facet: NarrationFacet | undefined): string {
  const t = useT();
  const step = useLab((state) => state.step);
  if (step === INITIAL_STEP) return t('view.narration.initial');
  const ref = facet === undefined ? undefined : narrationAt(facet, step);
  return ref === undefined ? t('view.narration.none') : t(ref);
}

/** The current step's translated narration, announced politely, under its scope path. */
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
