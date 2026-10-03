import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { i18nRef, type I18nRef } from '@cryventure/core';
import { drawPenguin, drawUpload } from './canvas.ts';
import type { Size } from './pixels.ts';

export type ImageSource = { kind: 'penguin' } | { kind: 'upload'; name: string };

export interface LoadedImage {
  source: ImageSource;
  /** Undefined until the picture is on the canvas. */
  size?: Size;
}

/**
 * Keeps the "original" canvas filled: the built-in penguin on mount, or a local upload.
 * `onLoaded` runs after every successful draw (the island clears the stale encryption there).
 */
export function useImageSource(canvasRef: RefObject<HTMLCanvasElement | null>, onLoaded: () => void) {
  const [image, setImage] = useState<LoadedImage>({ source: { kind: 'penguin' } });
  const [error, setError] = useState<I18nRef | undefined>(undefined);
  const loadIdRef = useRef(0);

  const load = useCallback(
    async (source: ImageSource, draw: (canvas: HTMLCanvasElement) => Promise<void>) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const loadId = ++loadIdRef.current;
      try {
        await draw(canvas);
        if (loadId !== loadIdRef.current) return;
        setImage({ source, size: { width: canvas.width, height: canvas.height } });
        setError(undefined);
        onLoaded();
      } catch {
        if (loadId === loadIdRef.current) setError(i18nRef('ui.penguin.upload.failed'));
      }
    },
    [canvasRef, onLoaded],
  );

  const showPenguin = useCallback(() => load({ kind: 'penguin' }, drawPenguin), [load]);
  const showUpload = useCallback((file: File) => load({ kind: 'upload', name: file.name }, (canvas) => drawUpload(canvas, file)), [load]);

  useEffect(() => {
    void showPenguin();
  }, [showPenguin]);

  return { image, error, showPenguin, showUpload };
}
