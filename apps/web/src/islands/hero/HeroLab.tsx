import './heroLab.css';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { parseHex } from '@cryventure/core';
import { toHex, useLabActions, useT } from '@cryventure/viz';
import Lab, { type LabProps, type LabToolbarProps } from '../Lab.tsx';
import { TEXT_EDIT_DEBOUNCE_MS } from '../lab/ParamPanel.tsx';
import { useDebouncedCallback } from '../shared/useDebouncedCallback.ts';
import { FIPS_C1_KEY_HEX, HERO_BLOCK_BYTES, clampToBytes, textToBlock } from './heroText.ts';

function blockBytes(hex: unknown): number[] {
  const parsed = typeof hex === 'string' ? parseHex(hex) : undefined;
  return parsed?.ok ? Array.from(parsed.bytes) : [];
}

/** The 16 plaintext bytes; zero padding is marked (dashed and muted, plus visually-hidden text for screen readers). */
function BlockPreview({ bytes, paddingFrom }: { bytes: readonly number[]; paddingFrom: number }) {
  const t = useT();
  return (
    <ol className="cv-hero-text__block" aria-label={t('ui.hero.blockLabel', { size: HERO_BLOCK_BYTES })}>
      {bytes.map((byte, index) => {
        const padding = index >= paddingFrom;
        return (
          <li key={index} className={padding ? 'cv-hero-text__byte cv-hero-text__byte--pad' : 'cv-hero-text__byte'} data-padding={padding || undefined}>
            {toHex(byte)}
            {padding && <span className="sr-only">{t('ui.hero.paddingByte')}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function PaddingNote({ touched, paddingBytes }: { touched: boolean; paddingBytes: number }) {
  const t = useT();
  let text = t('ui.hero.exampleNote');
  if (touched) text = paddingBytes === 0 ? t('ui.hero.noPadding') : t('ui.hero.paddingNote', { count: paddingBytes });
  return (
    <p className="cv-hero-text__note" data-testid="hero-padding-note">
      {text}
    </p>
  );
}

/**
 * The typed text, debounced into `requestParams`. When the lab's `plaintextHex` changes to something
 * the text did not produce (Apply in the Inputs panel, a deep link), the params win: the text is cleared
 * and a still-pending request is dropped, so it cannot overwrite the newer params.
 */
function useHeroText(paramsHex: string): [text: string | null, onText: (text: string) => void] {
  const { requestParams } = useLabActions();
  const [text, setText] = useState<string | null>(null);
  const [seenParamsHex, setSeenParamsHex] = useState(paramsHex);
  const pendingHexRef = useRef<string | null>(null);
  const request = useDebouncedCallback((plaintextHex: string) => {
    if (pendingHexRef.current === plaintextHex) requestParams({ plaintextHex });
  }, TEXT_EDIT_DEBOUNCE_MS);
  if (seenParamsHex !== paramsHex) {
    setSeenParamsHex(paramsHex);
    if (text !== null && textToBlock(text).plaintextHex !== paramsHex) setText(null);
  }
  useEffect(() => {
    if (text === null) pendingHexRef.current = null;
  }, [text]);
  const onText = (next: string) => {
    setText(next);
    pendingHexRef.current = textToBlock(next).plaintextHex;
    request(pendingHexRef.current);
  };
  return [text, onText];
}

/**
 * "Type your own text": ≤ 16 UTF-8 bytes → zero-padded `plaintextHex`, sent to the lab through
 * `useLabActions().requestParams` (no producer change). The key stays the FIPS 197 C.1 key, read-only here.
 */
export function HeroTextField({ params }: LabToolbarProps) {
  const t = useT();
  const inputId = useId();
  const counterId = useId();
  const keyId = useId();
  const paramsHex = typeof params['plaintextHex'] === 'string' ? params['plaintextHex'].toLowerCase() : '';
  const [text, onText] = useHeroText(paramsHex);
  const block = textToBlock(text ?? '');
  const touched = text !== null;
  const keyHex = typeof params['keyHex'] === 'string' ? params['keyHex'] : '';

  const onChange = (event: ChangeEvent<HTMLInputElement>) => onText(clampToBytes(event.target.value));

  return (
    <div className="cv-hero-text">
      <div className="cv-hero-text__row">
        <label htmlFor={inputId}>{t('ui.hero.textLabel')}</label>
        <span id={counterId} className="cv-hero-text__counter">
          {t('ui.lab.params.byteCount', { count: block.textBytes, max: HERO_BLOCK_BYTES })}
        </span>
      </div>
      <input id={inputId} className="cv-hero-text__input" type="text" value={text ?? ''} placeholder={t('ui.hero.textPlaceholder')} aria-describedby={counterId} autoComplete="off" spellCheck={false} onChange={onChange} />
      <BlockPreview bytes={touched ? Array.from(block.bytes) : blockBytes(paramsHex)} paddingFrom={touched ? block.textBytes : HERO_BLOCK_BYTES} />
      <PaddingNote touched={touched} paddingBytes={block.paddingBytes} />
      <div className="cv-hero-text__key">
        <label htmlFor={keyId}>{t(keyHex === FIPS_C1_KEY_HEX ? 'ui.hero.keyLabel' : 'ui.hero.keyLabelCustom')}</label>
        <input id={keyId} className="cv-hero-text__key-value" type="text" value={keyHex} readOnly />
      </div>
    </div>
  );
}

/**
 * The home hero's island (`components/HeroLab.astro`): the generic lab with the text field as its
 * toolbar, only the layout's views and no generic inputs panel. Same runtime, same params.
 */
export default function HeroLab(props: Omit<LabProps, 'toolbar' | 'views' | 'paramPanel'>) {
  return <Lab {...props} toolbar={HeroTextField} views="layout-only" paramPanel={false} />;
}
