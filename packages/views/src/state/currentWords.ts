import type { StateStep } from '@cryventure/core';
import { regionHighlights, WORD_BYTES } from './regionLayout.ts';

/** A step as seen by the word view: its highlights plus an optional `roundKeyIndex` on the op. */
export type WordStep = Pick<StateStep<string, { op: string }>, 'highlights'> & { roundKeyIndex?: unknown };

const NO_WORDS: ReadonlySet<number> = new Set();

/** Word indices of round key `index`, assuming square blocks (a round key has `WORD_BYTES` words, Nb = 4). */
export function roundKeyWords(index: number, wordsPerKey: number = WORD_BYTES): number[] {
  return Array.from({ length: wordsPerKey }, (_, offset) => index * wordsPerKey + offset);
}

/** Distinct word indices containing any of the flat byte `indices`. */
export function wordsOfIndices(indices: readonly number[], wordBytes: number = WORD_BYTES): number[] {
  return [...new Set(indices.map((index) => Math.floor(index / wordBytes)))].sort((a, b) => a - b);
}

/**
 * Words of `regionId` the step works with. Only steps that touch the region count; an op carrying a
 * numeric `roundKeyIndex` (e.g. AES addRoundKey) selects that round key's words, otherwise the words
 * containing the step's highlighted bytes are used.
 */
export function currentWords(step: WordStep | undefined, regionId: string): ReadonlySet<number> {
  const highlights = regionHighlights(step, regionId);
  if (highlights.length === 0) return NO_WORDS;
  if (typeof step?.roundKeyIndex === 'number') return new Set(roundKeyWords(step.roundKeyIndex));
  return new Set(wordsOfIndices(highlights.flatMap((highlight) => highlight.indices)));
}
