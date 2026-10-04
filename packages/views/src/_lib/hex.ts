import { chunk } from './chunk.ts';

/** Hex digits per chunk of a word (wordops). */
const WORD_CHUNK = 4;

/** Hex in lowercase chunks of `size` digits (the last may be shorter): "6A09E667" → ["6a09", "e667"]. */
export function hexChunks(hex: string, size = WORD_CHUNK): string[] {
  return chunk([...hex.toLowerCase()], size).map((digits) => digits.join(''));
}
