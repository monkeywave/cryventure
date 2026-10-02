import { useId } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { INITIAL_STEP, SPEEDS, isLastStep, selectStepCount } from '../lab/labReducers.ts';
import type { AnyStateFacet } from '@cryventure/core';
import { useLab, useLabActions } from '../lab/LabContext.tsx';
import { OUTER_SCOPE_LEVEL } from '../lab/scopeNavigation.ts';
import { useFacet } from '../lab/useFacet.ts';
import { PlayerIcon, type PlayerIconName } from './icons.tsx';

interface ControlButtonProps {
  label: string;
  icon: PlayerIconName;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
}

function ControlButton({ label, icon, shortcut, disabled, onClick }: ControlButtonProps) {
  return (
    <button type="button" className="cv-controls__button" aria-label={label} title={label} aria-keyshortcuts={shortcut} disabled={disabled} onClick={onClick}>
      <PlayerIcon name={icon} />
    </button>
  );
}

function SpeedSelect() {
  const t = useT();
  const id = useId();
  const speed = useLab((state) => state.speed);
  const { setSpeed } = useLabActions();
  return (
    <span className="cv-controls__speed">
      <label htmlFor={id}>{t('ui.player.speed')}</label>
      <select id={id} value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
        {SPEEDS.map((option) => (
          <option key={option} value={option}>
            {t('ui.player.speedOption', { speed: option })}
          </option>
        ))}
      </select>
    </span>
  );
}

const SECTION_KEYS = { next: 'ui.player.nextSection', prev: 'ui.player.prevSection' } as const;

/** Labels of the "step over a section" buttons: the producer's outermost scope level, else generic. */
function useSectionLabels(): { next: string; prev: string } {
  const t = useT();
  const level = useFacet<AnyStateFacet>('state').data?.scopeLevels?.[OUTER_SCOPE_LEVEL];
  return { next: t(level?.nextKey ?? SECTION_KEYS.next), prev: t(level?.prevKey ?? SECTION_KEYS.prev) };
}

/**
 * First / (previous section) / previous / play-pause / next / (next section) / last plus a speed
 * picker. The section buttons ("step over" the outermost scope, e.g. an AES round) appear in debugger mode.
 */
export function Controls() {
  const t = useT();
  const section = useSectionLabels();
  const step = useLab((state) => state.step);
  const stepCount = useLab(selectStepCount);
  const playing = useLab((state) => state.playing);
  const debugging = useLab((state) => state.mode === 'debugger');
  const actions = useLabActions();
  const atStart = step === INITIAL_STEP;
  const atEnd = isLastStep(step, stepCount);

  return (
    <div className="cv-controls" role="group" aria-label={t('ui.player.controls')}>
      <ControlButton label={t('ui.player.first')} icon="first" shortcut="Home" disabled={atStart} onClick={actions.first} />
      {debugging && <ControlButton label={section.prev} icon="prevScope" shortcut="Shift+ArrowLeft" disabled={atStart} onClick={actions.prevScope} />}
      <ControlButton label={t('ui.player.prev')} icon="prev" shortcut="ArrowLeft" disabled={atStart} onClick={actions.prev} />
      <ControlButton
        label={t(playing ? 'ui.player.pause' : 'ui.player.play')}
        icon={playing ? 'pause' : 'play'}
        shortcut="Space"
        disabled={stepCount === 0}
        onClick={actions.togglePlay}
      />
      <ControlButton label={t('ui.player.next')} icon="next" shortcut="ArrowRight" disabled={atEnd} onClick={actions.next} />
      {debugging && <ControlButton label={section.next} icon="nextScope" shortcut="Shift+ArrowRight" disabled={atEnd} onClick={actions.nextScope} />}
      <ControlButton label={t('ui.player.last')} icon="last" shortcut="End" disabled={atEnd} onClick={actions.last} />
      <SpeedSelect />
    </div>
  );
}
