import { PENGUIN_DATA_URL, PENGUIN_SIZE } from './penguinArt.ts';
import { fitWithin, rgbaToRgb, rgbToRgba, type Size } from './pixels.ts';

/** DOM glue for the PenguinLab canvases; the byte logic lives in the pure `pixels.ts`. */

/** Uploaded pictures are downscaled to at most this many pixels on their longest side. */
export const MAX_UPLOAD_SIDE = 256;

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

/** Decodes a local image file (it never leaves the browser) and draws it downscaled to `MAX_UPLOAD_SIDE`. */
export async function drawUpload(canvas: HTMLCanvasElement, file: Blob): Promise<void> {
  const bitmap = await createImageBitmap(file);
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
