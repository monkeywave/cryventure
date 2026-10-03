import { useId, type ChangeEvent, type Ref } from 'react';
import type { I18nRef } from '@cryventure/core';
import { useT } from '@cryventure/viz';
import { MAX_UPLOAD_SIDE } from './canvas.ts';
import { PENGUIN_MODES, type PenguinMode } from './penguinJob.ts';

/** Mode radios, key/IV fields and the picture chooser of the PenguinLab. Stateless: the island owns the values. */

export interface HexFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: I18nRef;
  hint?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

export function HexField({ label, value, onChange, error, hint, disabled, inputRef }: HexFieldProps) {
  const t = useT();
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="cv-penguin__field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        className="cv-penguin__hex"
        type="text"
        spellCheck={false}
        autoComplete="off"
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="cv-penguin__error">
          {t(error)}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="cv-penguin__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ModeSwitch({ mode, onChange }: { mode: PenguinMode; onChange: (mode: PenguinMode) => void }) {
  const t = useT();
  const name = useId();
  return (
    <fieldset className="cv-penguin__modes">
      <legend>{t('ui.penguin.mode.legend')}</legend>
      {PENGUIN_MODES.map((option) => (
        <label key={option} className="cv-penguin__mode">
          <input type="radio" name={name} value={option} checked={mode === option} onChange={() => onChange(option)} />
          {t(`ui.penguin.mode.${option}`)}
        </label>
      ))}
    </fieldset>
  );
}

export interface PictureChooserProps {
  isUpload: boolean;
  error?: I18nRef;
  onFile: (file: File) => void;
  onUsePenguin: () => void;
}

export function PictureChooser({ isUpload, error, onFile, onUsePenguin }: PictureChooserProps) {
  const t = useT();
  const id = useId();
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) onFile(file);
    event.target.value = '';
  };
  return (
    <div className="cv-penguin__field">
      <label htmlFor={id}>{t('ui.penguin.upload.label')}</label>
      <input id={id} className="cv-penguin__file" type="file" accept="image/*" aria-describedby={`${id}-hint`} onChange={choose} />
      <p id={`${id}-hint`} className="cv-penguin__hint">
        {t('ui.penguin.upload.hint', { max: MAX_UPLOAD_SIDE })}
      </p>
      {error && (
        <p className="cv-penguin__error" role="alert">
          {t(error)}
        </p>
      )}
      {isUpload && (
        <button type="button" className="cv-penguin__button" onClick={onUsePenguin}>
          {t('ui.penguin.upload.usePenguin')}
        </button>
      )}
    </div>
  );
}
