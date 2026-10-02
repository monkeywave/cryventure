import { useT } from '@cryventure/viz';
import { DEFAULT_LENS } from '../../progress/lens.ts';
import { useFocusedHeading } from './useFocusedHeading.ts';
import type { PrologueState } from './usePrologue.ts';

/** Relative to the prologue page, so they work under any base path and locale. */
const XOR_LESSON = '../xor/';
const AES_FIRST_LOOK = '../welcome-lab/';
const SEAL = '✓';

function NextSteps({ state }: { state: PrologueState }) {
  const t = useT();
  return (
    <div className="cv-prologue__ctas">
      <a className="cv-prologue__cta cv-prologue__cta--primary" href={XOR_LESSON}>
        {t('prologue.next.xor')}
        <span aria-hidden="true"> →</span>
      </a>
      <a className="cv-prologue__cta" href={AES_FIRST_LOOK}>
        {t('prologue.next.aes')}
      </a>
      <button type="button" className="cv-prologue__replay" onClick={state.replay}>
        {t('prologue.replay')}
      </button>
    </div>
  );
}

function formatDay(iso: string | undefined, locale: string | undefined): string {
  if (iso === undefined) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso));
}

/** Shown right after choosing a lens, and to learners who come back after finishing. */
export function Finale({ state, locale }: { state: PrologueState; locale?: string }) {
  const t = useT();
  const done = state.view === 'done';
  const headingRef = useFocusedHeading(state.view, state.interacted);
  const lensName = t(`lens.name.${state.lens ?? DEFAULT_LENS}`);
  const body = done ? t('prologue.done.lens', { lens: lensName }) : t('prologue.welcomeBack.body', { lens: lensName, date: formatDay(state.completedAt, locale) });
  return (
    <div className="cv-prologue__finale" data-view={state.view}>
      <span className="cv-prologue__seal" aria-hidden="true">
        {SEAL}
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="cv-prologue__title">
        {t(done ? 'prologue.done.title' : 'prologue.welcomeBack.title')}
      </h2>
      <p className="cv-prologue__lead">{body}</p>
      <NextSteps state={state} />
    </div>
  );
}
