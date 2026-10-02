import { useT } from '../i18n/I18nProvider.tsx';
import { LAB_MODES } from '../lab/labReducers.ts';
import { useLab, useLabActions } from '../lab/LabContext.tsx';

/** Story ↔ Debugger switch: two toggle buttons, exactly one pressed. */
export function ModeToggle() {
  const t = useT();
  const mode = useLab((state) => state.mode);
  const { setMode } = useLabActions();
  return (
    <div className="cv-mode" role="group" aria-label={t('ui.player.mode')}>
      {LAB_MODES.map((option) => (
        <button key={option} type="button" className="cv-mode__option" aria-pressed={mode === option} onClick={() => setMode(option)}>
          {t(`ui.player.mode.${option}`)}
        </button>
      ))}
    </div>
  );
}
