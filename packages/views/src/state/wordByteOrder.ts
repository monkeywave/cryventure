import type { RegionSpec, Track } from '@cryventure/core';
import type { GridHighlight, GridMotion } from '@cryventure/viz';
import type { WordRows } from './regionLayout.ts';

/**
 * How little-endian words (`words` layout `byteOrder: 'little'`, docs/M6.md §3c) are drawn:
 * `integer` = each word's bytes reversed so it reads as its integer value (the default);
 * `memory` = the bytes in memory order, as stored (engineer lens toggle).
 */
export type WordDisplay = 'integer' | 'memory';

/** The region's words are drawn reversed: little-endian, more than one element per word, shown as integers. */
export function reversesWords(words: WordRows | undefined, display: WordDisplay): boolean {
  return words?.byteOrder === 'little' && words.elemsPerWord > 1 && display === 'integer';
}

/** Any region declares little-endian words (the view then explains, and offers memory order). */
export function hasLittleEndianWords(regions: readonly Pick<RegionSpec<string>, 'layout'>[]): boolean {
  return regions.some((region) => region.layout?.kind === 'words' && region.layout.byteOrder === 'little');
}

/**
 * Displayed position of a flat memory index when each word's elements are reversed. Reversal is
 * its own inverse, so the same function maps a displayed position back to its memory index.
 */
export function displayIndex(index: number, elemsPerWord: number): number {
  const word = Math.floor(index / elemsPerWord);
  return word * elemsPerWord + (elemsPerWord - 1 - (index % elemsPerWord));
}

/** Values in displayed order: element `i` shows memory element `displayIndex(i)`. */
export function toDisplayOrder<T>(values: readonly T[], elemsPerWord: number): T[] {
  return values.map((_, index) => values[displayIndex(index, elemsPerWord)]!);
}

export function indexSetToDisplay(indices: ReadonlySet<number> | undefined, elemsPerWord: number): ReadonlySet<number> | undefined {
  return indices === undefined ? undefined : new Set([...indices].map((index) => displayIndex(index, elemsPerWord)));
}

export function highlightsToDisplay(highlights: readonly GridHighlight[], elemsPerWord: number): GridHighlight[] {
  return highlights.map((highlight) => ({ ...highlight, indices: highlight.indices.map((index) => displayIndex(index, elemsPerWord)) }));
}

export function tracksToDisplay(tracks: ReadonlyMap<number, readonly Track[]>, elemsPerWord: number): ReadonlyMap<number, readonly Track[]> {
  return new Map([...tracks].map(([index, list]) => [displayIndex(index, elemsPerWord), list]));
}

/** A grid motion (values before, placeholders, tracks) in displayed positions; the progress clock is shared. */
export function motionToDisplay(motion: GridMotion | undefined, elemsPerWord: number): GridMotion | undefined {
  if (motion === undefined) return undefined;
  return {
    progress: motion.progress,
    before: toDisplayOrder(motion.before, elemsPerWord),
    unwrittenBefore: indexSetToDisplay(motion.unwrittenBefore, elemsPerWord),
    unwrittenAfter: indexSetToDisplay(motion.unwrittenAfter, elemsPerWord),
    tracks: tracksToDisplay(motion.tracks, elemsPerWord),
  };
}

/** What a region hands its grid: values, marks and selection, all by flat index. */
export interface GridInputs {
  values: readonly number[];
  highlights: readonly GridHighlight[];
  motion: GridMotion | undefined;
  focus: ReadonlySet<number> | undefined;
  unwritten: ReadonlySet<number> | undefined;
  selectedIndex: number | undefined;
}

/**
 * The grid inputs in displayed positions (each word reversed when `elemsPerWord` is given), so
 * highlights, placeholders, motion and selection stay on the memory byte they belong to.
 */
export function gridInputsToDisplay(inputs: GridInputs, elemsPerWord: number | undefined): GridInputs {
  if (elemsPerWord === undefined) return inputs;
  return {
    values: toDisplayOrder(inputs.values, elemsPerWord),
    highlights: highlightsToDisplay(inputs.highlights, elemsPerWord),
    motion: motionToDisplay(inputs.motion, elemsPerWord),
    focus: indexSetToDisplay(inputs.focus, elemsPerWord),
    unwritten: indexSetToDisplay(inputs.unwritten, elemsPerWord),
    selectedIndex: inputs.selectedIndex === undefined ? undefined : displayIndex(inputs.selectedIndex, elemsPerWord),
  };
}
