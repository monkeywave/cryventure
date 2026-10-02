import { useId, useMemo } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { useLab, useLabActions } from '../lab/LabContext.tsx';
import { distinctOps, stateSteps } from '../lab/stateSteps.ts';
import { opLabel, useOpLabels } from './opLabel.ts';

/** Debugger breakpoints: one toggle chip per distinct op of the trace (B toggles the current op). */
export function BreakpointPicker() {
  const t = useT();
  const hintId = useId();
  const debugging = useLab((state) => state.mode === 'debugger');
  const bundle = useLab((state) => state.bundle);
  const breakpoints = useLab((state) => state.breakpoints);
  const { toggleBreakpoint } = useLabActions();
  const opLabels = useOpLabels();
  const ops = useMemo(() => distinctOps(stateSteps(bundle)), [bundle]);
  if (!debugging || bundle === null || ops.length === 0) return null;

  return (
    <div className="cv-breakpoints" role="group" aria-label={t('ui.player.breakpoints')} aria-describedby={hintId} aria-keyshortcuts="B">
      <span className="cv-breakpoints__title">{t('ui.player.breakpoints')}</span>
      {ops.map((op) => (
        <button key={op} type="button" className="cv-chip" data-op={op} aria-pressed={breakpoints.includes(op)} onClick={() => toggleBreakpoint(op)}>
          {opLabel(t, opLabels, op)}
        </button>
      ))}
      <span id={hintId} className="cv-breakpoints__hint">
        {t('ui.player.breakpointsHint')}
      </span>
    </div>
  );
}
