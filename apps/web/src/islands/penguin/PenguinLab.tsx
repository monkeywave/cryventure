import { useCallback, useEffect, useId, useMemo, useRef, useState, type SubmitEvent } from 'react';
import type { I18nRef, Messages } from '@cryventure/core';
import { I18nProvider, useT } from '@cryventure/viz';
import { useHydrated } from '../shared/useHydrated.ts';
import { DEFAULT_IV_HEX, DEFAULT_KEY_HEX, PENGUIN_BLOCK_BYTES, parseBlockHex } from './blockInput.ts';
import { drawBytes, readRgb } from './canvas.ts';
import { EncryptedFigure, OriginalFigure } from './PenguinFigures.tsx';
import { HexField, ModeSwitch, PictureChooser } from './PenguinControls.tsx';
import type { PenguinMode } from './penguinJob.ts';
import { countRepeatedBlocks } from './pixels.ts';
import { useImageSource } from './useImageSource.ts';
import { usePenguinWorker, type PenguinJobState, type WorkerFactory } from './usePenguinWorker.ts';

export interface PenguinLabProps {
  /** `ui.penguin.*` and `core.error.*` of the page locale (assembled by `PenguinLab.astro`). */
  messages: Messages;
  locale?: string;
  /** Preselected mode; default `ecb`. */
  initialMode?: PenguinMode;
  /** Test seam: builds the worker (default: the bundled `penguin.worker.ts` module worker). */
  createWorker?: WorkerFactory;
}

function useEncryptedCanvas(job: PenguinJobState) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const result = job.status === 'done' ? job.result : undefined;
  useEffect(() => {
    if (result !== undefined && canvasRef.current !== null) drawBytes(canvasRef.current, result.ciphertext, result);
  }, [result]);
  const stats = useMemo(() => (result === undefined ? undefined : countRepeatedBlocks(result.ciphertext, PENGUIN_BLOCK_BYTES)), [result]);
  return { canvasRef, stats };
}

function StatusLine({ job, stats }: { job: PenguinJobState; stats?: { repeated: number; total: number } }) {
  const t = useT();
  let text = '';
  if (job.status === 'done' && stats) text = t(`ui.penguin.result.${job.result.mode}`, { ...stats, count: stats.repeated });
  else if (job.status === 'busy') text = t('ui.penguin.busy', { mode: job.mode.toUpperCase() });
  else if (job.status === 'error') text = t(job.error);
  return (
    <p className="cv-penguin__status" role="status" data-status={job.status}>
      {text}
    </p>
  );
}

function errorOf(result: ReturnType<typeof parseBlockHex>): I18nRef | undefined {
  return result.ok ? undefined : result.error;
}

function PenguinLabBody({ initialMode = 'ecb', createWorker }: Omit<PenguinLabProps, 'messages' | 'locale'>) {
  const t = useT();
  const hydrated = useHydrated();
  const titleId = useId();
  const [mode, setMode] = useState<PenguinMode>(initialMode);
  const [keyHex, setKeyHex] = useState(DEFAULT_KEY_HEX);
  const [ivHex, setIvHex] = useState(DEFAULT_IV_HEX);
  const keyRef = useRef<HTMLInputElement>(null);
  const ivRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const worker = usePenguinWorker(createWorker);
  const { reset } = worker;
  const onImageLoaded = useCallback(() => reset(), [reset]);
  const source = useImageSource(originalRef, onImageLoaded);
  const encrypted = useEncryptedCanvas(worker.state);
  const key = parseBlockHex(keyHex, 'key');
  const iv = parseBlockHex(ivHex, 'iv');
  const usesIv = mode === 'cbc';

  const encrypt = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!key.ok) return keyRef.current?.focus();
    if (usesIv && !iv.ok) return ivRef.current?.focus();
    if (originalRef.current === null || source.image.size === undefined) return;
    const pixels = readRgb(originalRef.current);
    // ECB ignores the IV, so an invalid IV field must not block it.
    worker.start({ mode, key: key.bytes, iv: iv.ok ? iv.bytes : new Uint8Array(PENGUIN_BLOCK_BYTES), ...pixels });
  };

  return (
    <section className="cv-penguin" aria-labelledby={titleId} data-hydrated={hydrated}>
      <p id={titleId} className="cv-penguin__title">
        {t('ui.penguin.title')}
      </p>
      <p className="cv-penguin__intro">{t('ui.penguin.intro')}</p>
      <form className="cv-penguin__controls" onSubmit={encrypt} noValidate>
        <ModeSwitch mode={mode} onChange={setMode} />
        <HexField label={t('ui.penguin.key.label')} value={keyHex} onChange={setKeyHex} error={errorOf(key)} inputRef={keyRef} />
        <HexField
          label={t('ui.penguin.iv.label')}
          value={ivHex}
          onChange={setIvHex}
          error={usesIv ? errorOf(iv) : undefined}
          hint={t(usesIv ? 'ui.penguin.iv.fixedHint' : 'ui.penguin.iv.ecbHint')}
          disabled={!usesIv}
          inputRef={ivRef}
        />
        <PictureChooser isUpload={source.image.source.kind === 'upload'} error={source.error} onFile={(file) => void source.showUpload(file)} onUsePenguin={() => void source.showPenguin()} />
        <button type="submit" className="cv-penguin__button cv-penguin__button--primary" disabled={!hydrated || worker.state.status === 'busy'}>
          {t('ui.penguin.encrypt')}
        </button>
      </form>
      <StatusLine job={worker.state} stats={encrypted.stats} />
      <div className="cv-penguin__figures">
        <OriginalFigure canvasRef={originalRef} image={source.image} />
        <EncryptedFigure canvasRef={encrypted.canvasRef} job={worker.state} stats={encrypted.stats} />
      </div>
      <p className="cv-penguin__hint">{t('ui.penguin.padding')}</p>
    </section>
  );
}

/** Interactive ECB-penguin demo (docs/M3.md §9): encrypts an image's pixels with AES-ECB or AES-CBC in a worker. */
export default function PenguinLab({ messages, locale, ...props }: PenguinLabProps) {
  return (
    <I18nProvider messages={messages} locale={locale}>
      <PenguinLabBody {...props} />
    </I18nProvider>
  );
}
