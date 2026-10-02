import { useId, type ChangeEvent } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { INITIAL_STEP } from '../lab/labReducers.ts';
import { useLab, useLabActions } from '../lab/LabContext.tsx';
import { useScopeLabel } from './useScopeLabel.ts';

/** Scrubber over the shared timeline with "Step x / n" and the current scope path. */
export function Timeline() {
  const t = useT();
  const id = useId();
  const step = useLab((state) => state.step);
  const stepCount = useLab((state) => state.stepCount);
  const { seek } = useLabActions();
  const scopeLabel = useScopeLabel();
  const stepText = t('ui.player.stepOf', { current: step + 1, total: stepCount });
  const detail = step === INITIAL_STEP ? t('ui.player.initial') : scopeLabel;

  return (
    <div className="cv-timeline">
      <input
        id={id}
        className="cv-timeline__slider"
        type="range"
        min={INITIAL_STEP}
        max={Math.max(stepCount - 1, INITIAL_STEP)}
        step={1}
        value={step}
        disabled={stepCount === 0}
        aria-label={t('ui.player.timeline')}
        aria-valuetext={detail === '' ? stepText : `${stepText}${t('ui.scope.separator')}${detail}`}
        onChange={(event: ChangeEvent<HTMLInputElement>) => seek(Number(event.target.value))}
      />
      <output className="cv-timeline__step" htmlFor={id}>
        {stepText}
      </output>
      {detail !== '' && <span className="cv-timeline__scope">{detail}</span>}
    </div>
  );
}
