import { i18nRef, type I18nRef } from '@cryventure/core';
import { PENGUIN_DATA_URL, PENGUIN_SIZE } from './penguinArt.ts';
import { fitWithin, rgbaToRgb, rgbToRgba, type Size } from './pixels.ts';

/** DOM glue for the PenguinLab canvases; the byte logic lives in the pure `pixels.ts`. */

/** Uploaded pictures are downscaled to at most this many pixels on their longest side. */
export const MAX_UPLOAD_SIDE = 256;

/** Larger files are refused before decoding: a 50-megapixel photo decoded at full size can crash a phone's tab. */
export const MAX_UPLOAD_MB = 20;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** The translated reason a file is refused, or undefined if it may be decoded. */
export function uploadSizeError(file: Blob): I18nRef | undefined {
  return file.size > MAX_UPLOAD_BYTES ? i18nRef('ui.penguin.upload.tooLarge', { max: MAX_UPLOAD_MB }) : undefined;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('PenguinLab: no 2D canvas context');
  return context;
}

function drawSource(canvas: HTMLCanvasElement, source: CanvasImageSource, size: Size): void {
  canvas.width = size.width;
  canvas.height = size.height;
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
}

/** Rasterises the built-in penguin SVG at `PENGUIN_SIZE` × `PENGUIN_SIZE`. */
export async function drawPenguin(canvas: HTMLCanvasElement): Promise<void> {
  const image = new Image(PENGUIN_SIZE, PENGUIN_SIZE);
  image.src = PENGUIN_DATA_URL;
  await image.decode();
  drawSource(canvas, image, { width: PENGUIN_SIZE, height: PENGUIN_SIZE });
}

/** The intrinsic size of an image file, read from its header via `<img>` (browsers decode the pixels lazily, on draw). */
export async function probeImageSize(file: Blob): Promise<Size> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('PenguinLab: unreadable image'));
      image.src = url;
    });
    if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new Error('PenguinLab: image has no intrinsic size');
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes a local image file straight to at most `MAX_UPLOAD_SIDE` pixels per side (`resizeWidth` /
 * `resizeHeight`), so the full-size bitmap is never held. Falls back to a plain decode where the resize
 * options or the size probe are unsupported; `drawSource` still downscales then.
 */
export async function decodeUpload(file: Blob, probeSize: (file: Blob) => Promise<Size> = probeImageSize): Promise<ImageBitmap> {
  const tooLarge = uploadSizeError(file);
  if (tooLarge !== undefined) throw new Error(`PenguinLab: ${tooLarge.key}`);
  const size = await probeSize(file).catch(() => undefined);
  if (size === undefined) return createImageBitmap(file);
  const target = fitWithin(size, MAX_UPLOAD_SIDE);
  try {
    return await createImageBitmap(file, { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' });
  } catch {
    return createImageBitmap(file);
  }
}

/** Decodes a local image file (it never leaves the browser) and draws it downscaled to `MAX_UPLOAD_SIDE`. */
export async function drawUpload(canvas: HTMLCanvasElement, file: Blob): Promise<void> {
  const bitmap = await decodeUpload(file);
  try {
    drawSource(canvas, bitmap, fitWithin({ width: bitmap.width, height: bitmap.height }, MAX_UPLOAD_SIDE));
  } finally {
    bitmap.close();
  }
}

export interface CanvasPixels extends Size {
  rgb: Uint8Array;
}

/** The canvas pixels as RGB bytes (alpha dropped). */
export function readRgb(canvas: HTMLCanvasElement): CanvasPixels {
  const { width, height } = canvas;
  return { width, height, rgb: rgbaToRgb(context2d(canvas).getImageData(0, 0, width, height).data) };
}

/** Draws `bytes` as opaque RGB pixels (padding bytes beyond `width × height` pixels are not shown). */
export function drawBytes(canvas: HTMLCanvasElement, bytes: Uint8Array, size: Size): void {
  canvas.width = size.width;
  canvas.height = size.height;
  context2d(canvas).putImageData(new ImageData(rgbToRgba(bytes, size.width * size.height), size.width, size.height), 0, 0);
}
