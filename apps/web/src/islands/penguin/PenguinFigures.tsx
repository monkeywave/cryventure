import type { RefObject } from 'react';
import { useT } from '@cryventure/viz';
import type { LoadedImage } from './useImageSource.ts';
import type { PenguinJobState } from './usePenguinWorker.ts';

/** The two canvases side by side (stacked on narrow screens), each with a caption and a text alternative. */

export interface BlockStats {
  repeated: number;
  total: number;
}

function originalLabel(t: ReturnType<typeof useT>, image: LoadedImage): string | undefined {
  if (image.size === undefined) return undefined;
  return image.source.kind === 'penguin'
    ? t('ui.penguin.original.altPenguin', { ...image.size })
    : t('ui.penguin.original.altUpload', { name: image.source.name, ...image.size });
}

export function OriginalFigure({ canvasRef, image }: { canvasRef: RefObject<HTMLCanvasElement | null>; image: LoadedImage }) {
  const t = useT();
  return (
    <figure className="cv-penguin__figure">
      <canvas ref={canvasRef} className="cv-penguin__canvas" role="img" aria-label={originalLabel(t, image)} data-testid="penguin-original" />
      <figcaption>{t('ui.penguin.original.caption')}</figcaption>
    </figure>
  );
}

export interface EncryptedFigureProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  job: PenguinJobState;
  stats?: BlockStats;
}

export function EncryptedFigure({ canvasRef, job, stats }: EncryptedFigureProps) {
  const t = useT();
  const done = job.status === 'done' ? job.result : undefined;
  const mode = done?.mode.toUpperCase();
  const label = done && stats ? t('ui.penguin.encrypted.alt', { mode: mode!, ...stats }) : t('ui.penguin.encrypted.altEmpty');
  return (
    <figure className="cv-penguin__figure" aria-busy={job.status === 'busy'}>
      <div className="cv-penguin__frame">
        <canvas ref={canvasRef} className="cv-penguin__canvas" role="img" aria-label={label} data-testid="penguin-encrypted" data-mode={done?.mode} hidden={!done} />
        {!done && <p className="cv-penguin__placeholder">{job.status === 'busy' ? t('ui.penguin.busy', { mode: job.mode.toUpperCase() }) : t('ui.penguin.encrypted.empty')}</p>}
      </div>
      <figcaption>{mode ? t('ui.penguin.encrypted.caption', { mode }) : t('ui.penguin.encrypted.captionEmpty')}</figcaption>
    </figure>
  );
}
