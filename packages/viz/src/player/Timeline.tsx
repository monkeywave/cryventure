import { useId, useMemo, type ChangeEvent, type CSSProperties } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { INITIAL_STEP, selectStepCount } from '../lab/labReducers.ts';
import { useLab, useLabActions } from '../lab/LabContext.tsx';
import { stateSteps } from '../lab/stateSteps.ts';
import { markerPosition, timelineMarkers } from './timelineMarkers.ts';
import { useScopeLabel } from './useScopeLabel.ts';

function Marker({ step, stepCount, kind }: { step: number; stepCount: number; kind: 'round' | 'breakpoint' }) {
  const style = { '--cv-mark-at': markerPosition(step, stepCount) } as CSSProperties;
  return <span className={`cv-timeline__mark cv-timeline__mark--${kind}`} data-step={step} style={style} />;
}

/** Round ticks and breakpoint dots under the slider (decorative; the same info is in the controls). */
function TimelineMarks() {
  const bundle = useLab((state) => state.bundle);
  const stepCount = useLab(selectStepCount);
  const breakpoints = useLab((state) => state.breakpoints);
  const markers = useMemo(() => timelineMarkers(stateSteps(bundle), breakpoints), [bundle, breakpoints]);
  return (
    <div className="cv-timeline__marks" aria-hidden="true">
      {markers.rounds.map((step) => (
        <Marker key={`r${step}`} step={step} stepCount={stepCount} kind="round" />
      ))}
      {markers.breakpoints.map((step) => (
        <Marker key={`b${step}`} step={step} stepCount={stepCount} kind="breakpoint" />
      ))}
    </div>
  );
}

/** Scrubber over the shared timeline with round/breakpoint markers, "Step x / n" and the current scope path. */
export function Timeline() {
  const t = useT();
  const id = useId();
  const step = useLab((state) => state.step);
  const stepCount = useLab(selectStepCount);
  const { seek } = useLabActions();
  const scopeLabel = useScopeLabel();
  const stepText = t('ui.player.stepOf', { current: step + 1, total: stepCount });
  const detail = step === INITIAL_STEP ? t('ui.player.initial') : scopeLabel;

  return (
    <div className="cv-timeline">
      <div className="cv-timeline__track">
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
        <TimelineMarks />
      </div>
      <output className="cv-timeline__step" htmlFor={id}>
        {stepText}
      </output>
      {detail !== '' && <span className="cv-timeline__scope">{detail}</span>}
    </div>
  );
}
