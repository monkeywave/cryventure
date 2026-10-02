import { MathText, useCurrentNarration, useScopeLabel, useT, type ViewProps } from '@cryventure/viz';
import './narration.css';

/**
 * The current step's (story mode: beat's) translated narration, announced politely, under its scope path.
 * Narrow labs show the same text in the player's caption instead (`narrowPlacement: 'caption'`, so the
 * workspace hides this view there).
 */
export default function NarrationView(_props: ViewProps) {
  const t = useT();
  const scope = useScopeLabel();
  const text = useCurrentNarration();

  return (
    <section className="cv-narration-view" aria-label={t('view.narration.title')}>
      {scope !== '' && <p className="cv-narration__scope">{scope}</p>}
      <p className="cv-narration" aria-live="polite" aria-atomic="true">
        <MathText text={text} />
      </p>
    </section>
  );
}
