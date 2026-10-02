import { useId } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { INITIAL_STEP, SPEEDS, isAtEnd } from '../lab/labReducers.ts';
import { useLab, useLabActions } from '../lab/LabContext.tsx';
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

/**
 * First / (previous round) / previous / play-pause / next / (next round) / last plus a speed picker.
 * The round buttons ("step over" a whole round) appear in debugger mode.
 */
export function Controls() {
  const t = useT();
  const step = useLab((state) => state.step);
  const stepCount = useLab((state) => state.stepCount);
  const playing = useLab((state) => state.playing);
  const debugging = useLab((state) => state.mode === 'debugger');
  const actions = useLabActions();
  const atStart = step === INITIAL_STEP;
  const atEnd = isAtEnd({ step, stepCount });

  return (
    <div className="cv-controls" role="group" aria-label={t('ui.player.controls')}>
      <ControlButton label={t('ui.player.first')} icon="first" shortcut="Home" disabled={atStart} onClick={actions.first} />
      {debugging && <ControlButton label={t('ui.player.prevRound')} icon="prevRound" shortcut="Shift+ArrowLeft" disabled={atStart} onClick={actions.prevRound} />}
      <ControlButton label={t('ui.player.prev')} icon="prev" shortcut="ArrowLeft" disabled={atStart} onClick={actions.prev} />
      <ControlButton
        label={t(playing ? 'ui.player.pause' : 'ui.player.play')}
        icon={playing ? 'pause' : 'play'}
        shortcut="Space"
        disabled={stepCount === 0}
        onClick={actions.togglePlay}
      />
      <ControlButton label={t('ui.player.next')} icon="next" shortcut="ArrowRight" disabled={atEnd} onClick={actions.next} />
      {debugging && <ControlButton label={t('ui.player.nextRound')} icon="nextRound" shortcut="Shift+ArrowRight" disabled={atEnd} onClick={actions.nextRound} />}
      <ControlButton label={t('ui.player.last')} icon="last" shortcut="End" disabled={atEnd} onClick={actions.last} />
      <SpeedSelect />
    </div>
  );
}
