import { useId, useMemo, useState } from 'react';
import { toHex, xorBytes, type Lens } from '@cryventure/core';
import { useT } from '@cryventure/viz';
import { LENS_ORDER } from '../../progress/lens.ts';
import { EveView, XorTiles } from './ByteViews.tsx';
import { bytesToNote, MAX_NOTE_BYTES } from './noteBytes.ts';
import type { PrologueState } from './usePrologue.ts';

type SceneProps = { state: PrologueState };

function Explain({ messageKey }: { messageKey: string }) {
  const t = useT();
  return <p className="cv-prologue__explain">{t(messageKey)}</p>;
}

export function NoteScene({ state }: SceneProps) {
  const t = useT();
  const inputId = useId();
  const counterId = useId();
  const empty = state.noteBytes.length === 0;
  return (
    <>
      <div className="cv-prologue__field">
        <label htmlFor={inputId}>{t('prologue.scene.note.input')}</label>
        <input
          id={inputId}
          type="text"
          value={state.note}
          onChange={(event) => state.setNote(event.target.value)}
          maxLength={MAX_NOTE_BYTES}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={counterId}
          aria-invalid={empty || undefined}
        />
        <span id={counterId} className="cv-prologue__counter">
          {t('prologue.scene.note.bytes', { used: state.noteBytes.length, max: MAX_NOTE_BYTES })}
        </span>
        <p role="status" className="cv-prologue__hint">
          {empty ? t('prologue.scene.note.empty') : ''}
        </p>
      </div>
      <EveView bytes={state.noteBytes} readable />
      <Explain messageKey="prologue.scene.note.explain" />
    </>
  );
}

function useCiphertext(state: PrologueState): Uint8Array {
  const { noteBytes, key } = state;
  return useMemo(() => (key.length === noteBytes.length ? xorBytes(noteBytes, key) : new Uint8Array(0)), [noteBytes, key]);
}

export function EncryptScene({ state }: SceneProps) {
  const t = useT();
  const ciphertext = useCiphertext(state);
  const [rolled, setRolled] = useState(false);
  const roll = (): void => {
    state.rollKey();
    setRolled(true);
  };
  return (
    <>
      <XorTiles input={state.noteBytes} inputRole="plaintext" keyBytes={state.key} output={ciphertext} outputRole="ciphertext" revealId={toHex(state.key)} />
      <div className="cv-prologue__row">
        <button type="button" className="cv-prologue__button" onClick={roll}>
          {t('prologue.scene.encrypt.newKey')}
        </button>
        <p role="status" className="cv-prologue__hint">
          {rolled ? t('prologue.scene.encrypt.newKeyDone') : ''}
        </p>
      </div>
      <EveView bytes={ciphertext} readable={false} />
      <Explain messageKey="prologue.scene.encrypt.explain" />
    </>
  );
}

export function DecryptScene({ state }: SceneProps) {
  const t = useT();
  const ciphertext = useCiphertext(state);
  const recovered = useMemo(() => (ciphertext.length === state.key.length ? xorBytes(ciphertext, state.key) : ciphertext), [ciphertext, state.key]);
  return (
    <>
      <XorTiles input={ciphertext} inputRole="ciphertext" keyBytes={state.key} output={recovered} outputRole="plaintext" revealId={`bob-${toHex(state.key)}`} />
      <p className="cv-prologue__bob">
        <span className="cv-prologue__bob-label">{t('prologue.scene.decrypt.bobReads')}</span>
        <q className="cv-prologue__bob-note">{bytesToNote(recovered)}</q>
      </p>
      <EveView bytes={ciphertext} readable={false} />
      <Explain messageKey="prologue.scene.decrypt.explain" />
    </>
  );
}

const ARROW = '→';
const LENS_MARK: Record<Lens, string> = { story: '¶', engineer: '0x', cryptographer: '∑' };

export function ChooseScene({ state }: SceneProps) {
  const t = useT();
  return (
    <ul className="cv-lens-cards">
      {LENS_ORDER.map((lens) => (
        <li key={lens}>
          <button type="button" className="cv-lens-card" data-lens={lens} onClick={() => state.choose(lens)}>
            <span className="cv-lens-card__top" aria-hidden="true">
              <span className="cv-lens-card__mark">{LENS_MARK[lens]}</span>
              <span className="cv-lens-card__arrow">{ARROW}</span>
            </span>
            <span className="cv-lens-card__name">{t(`lens.name.${lens}`)}</span>
            <span className="cv-lens-card__description">{t(`prologue.lens.${lens}.description`)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
