import type { ReactNode } from 'react';
import type { Messages } from '@cryventure/core';
import { I18nProvider, useT } from '@cryventure/viz';
import { useHydrated } from '../shared/useHydrated.ts';
import { Finale } from './Finale.tsx';
import type { FillRandom } from './noteBytes.ts';
import { SCENES, sceneNumber, type SceneId } from './prologueModel.ts';
import { ChooseScene, DecryptScene, EncryptScene, NoteScene } from './Scenes.tsx';
import { Stage } from './Stage.tsx';
import { useFocusedHeading } from './useFocusedHeading.ts';
import { usePrologue, type PrologueState } from './usePrologue.ts';

export interface PrologueProps {
  /** The `prologue.*` and `lens.*` messages of the page locale (assembled by `Prologue.astro`). */
  messages: Messages;
  locale?: string;
  /** Random source for the one-time key; tests pass a deterministic one. */
  fill?: FillRandom;
}

const SCENE_VIEWS: Record<SceneId, (props: { state: PrologueState }) => ReactNode> = {
  note: NoteScene,
  encrypt: EncryptScene,
  decrypt: DecryptScene,
  choose: ChooseScene,
};

function SceneProgress({ scene }: { scene: SceneId }) {
  const t = useT();
  const current = sceneNumber(scene);
  return (
    <div className="cv-prologue__progress">
      <ol className="cv-prologue__dots" aria-hidden="true">
        {SCENES.map((id) => (
          <li key={id} data-state={sceneNumber(id) < current ? 'done' : id === scene ? 'current' : 'todo'} />
        ))}
      </ol>
      <p className="cv-prologue__step" aria-live="polite">
        {t('prologue.progress', { current, total: SCENES.length })}
      </p>
    </div>
  );
}

function SceneNav({ state }: { state: PrologueState }) {
  const t = useT();
  const { scene } = state;
  return (
    <div className="cv-prologue__nav">
      {scene !== SCENES[0] && (
        <button type="button" className="cv-prologue__button" onClick={state.back}>
          <span aria-hidden="true">← </span>
          {t('prologue.back')}
        </button>
      )}
      {scene !== 'choose' && (
        <button type="button" className="cv-prologue__button cv-prologue__button--primary" onClick={state.next} aria-disabled={state.noteBytes.length === 0 || undefined}>
          {t('prologue.next')}
          <span aria-hidden="true"> →</span>
        </button>
      )}
    </div>
  );
}

function Tour({ state }: { state: PrologueState }) {
  const t = useT();
  const { scene } = state;
  const headingRef = useFocusedHeading(scene, state.interacted);
  const SceneView = SCENE_VIEWS[scene];
  return (
    <div className="cv-prologue__tour" data-scene={scene}>
      <div className="cv-prologue__bar">
        <SceneProgress scene={scene} />
        {scene !== 'choose' && (
          <button type="button" className="cv-prologue__skip" onClick={state.skip}>
            {t('prologue.skip')}
          </button>
        )}
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="cv-prologue__title">
        {t(`prologue.scene.${scene}.title`)}
      </h2>
      <p className="cv-prologue__lead">{t(`prologue.scene.${scene}.lead`)}</p>
      {scene !== 'choose' && <Stage scene={scene} />}
      <div className="cv-prologue__scene">
        <SceneView state={state} />
      </div>
      <SceneNav state={state} />
    </div>
  );
}

function PrologueBody({ locale, fill }: Omit<PrologueProps, 'messages'>) {
  const t = useT();
  const state = usePrologue(t('prologue.defaultNote'), fill);
  const hydrated = useHydrated();
  if (!hydrated) {
    // Stored progress is unknown until hydrated; a neutral placeholder avoids flashing the tour at returning learners.
    return (
      <section className="cv-prologue" aria-label={t('prologue.region')} aria-busy="true" data-hydrated={false}>
        <div className="cv-prologue__placeholder" />
      </section>
    );
  }
  return (
    <section className="cv-prologue" aria-label={t('prologue.region')} data-view={state.view} data-hydrated={hydrated}>
      {state.view === 'tour' ? <Tour state={state} /> : <Finale state={state} locale={locale} />}
    </section>
  );
}

/**
 * The 90-second prologue (docs/PLAN.md §4): Alice XORs a note so Eve on the wire sees only noise,
 * Bob recovers it with the same key, then the learner picks the default lens.
 */
export default function Prologue({ messages, locale, fill }: PrologueProps) {
  return (
    <I18nProvider messages={messages} locale={locale}>
      <PrologueBody locale={locale} fill={fill} />
    </I18nProvider>
  );
}
