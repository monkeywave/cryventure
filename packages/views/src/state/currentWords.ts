import type { GridHighlight } from '@cryventure/viz';

/** Distinct, sorted word indices containing any of the flat element `indices`. */
export function wordsOfIndices(indices: readonly number[], elemsPerWord: number): number[] {
  return [...new Set(indices.map((index) => Math.floor(index / elemsPerWord)))].sort((a, b) => a - b);
}

/**
 * Words the current step works with: those containing the step's highlighted elements of the
 * region (the producer highlights what it uses, e.g. AES the bytes of the current round key).
 */
export function currentWords(highlights: readonly GridHighlight[], elemsPerWord: number): ReadonlySet<number> {
  return new Set(wordsOfIndices(highlights.flatMap((highlight) => highlight.indices), elemsPerWord));
}
