/**
 * Pure pixel/byte helpers for the PenguinLab (docs/M3.md §9). No DOM: the island and the worker
 * pass plain typed arrays, so all of this is unit-tested in node.
 */
import { blocksOf, toHex } from '@cryventure/core';

export const RGB_CHANNELS = 3;
export const RGBA_CHANNELS = 4;
const OPAQUE = 255;

export interface Size {
  width: number;
  height: number;
}

/** Drops the alpha channel: `[r,g,b,a, r,g,b,a, …]` → `[r,g,b, r,g,b, …]`. Only the colours are encrypted. */
export function rgbaToRgb(rgba: ArrayLike<number>): Uint8Array {
  const pixelCount = Math.floor(rgba.length / RGBA_CHANNELS);
  const rgb = new Uint8Array(pixelCount * RGB_CHANNELS);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    rgb[pixel * RGB_CHANNELS] = rgba[pixel * RGBA_CHANNELS]!;
    rgb[pixel * RGB_CHANNELS + 1] = rgba[pixel * RGBA_CHANNELS + 1]!;
    rgb[pixel * RGB_CHANNELS + 2] = rgba[pixel * RGBA_CHANNELS + 2]!;
  }
  return rgb;
}

/**
 * Draws a byte stream back as `pixelCount` opaque pixels: three bytes per pixel, alpha 255.
 * Extra bytes (the padded tail of the last cipher block) are ignored; missing bytes stay 0.
 */
export function rgbToRgba(rgb: ArrayLike<number>, pixelCount: number): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(pixelCount * RGBA_CHANNELS);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    for (let channel = 0; channel < RGB_CHANNELS; channel++) rgba[pixel * RGBA_CHANNELS + channel] = rgb[pixel * RGB_CHANNELS + channel] ?? 0;
    rgba[pixel * RGBA_CHANNELS + RGB_CHANNELS] = OPAQUE;
  }
  return rgba;
}

/** Scales `size` down (never up) so its longest side is at most `maxSide`, keeping the aspect ratio; each side stays ≥ 1. */
export function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/** How many blocks equal an earlier block, e.g. 2 for `A B A C A`. ECB leaks exactly this structure. */
export function countRepeatedBlocks(bytes: Uint8Array, blockSize: number): { repeated: number; total: number } {
  const wholeBlocks = bytes.subarray(0, bytes.length - (bytes.length % blockSize));
  const blocks = blocksOf(wholeBlocks, blockSize);
  const distinct = new Set(blocks.map((block) => toHex(block)));
  return { repeated: blocks.length - distinct.size, total: blocks.length };
}
