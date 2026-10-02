import { elemBytes, regionSize, type Highlight, type RegionSpec, type StateStep } from '@cryventure/core';
import type { GridHighlight, GridShape } from '@cryventure/viz';

/** Regions up to this many rows/columns render as a matrix; longer ones as hex rows. */
export const MATRIX_MAX_DIM = 8;
export const BYTES_PER_ROW = 16;

/** Regions with more elements than this (e.g. the 176-byte AES key schedule) render collapsible. */
export const COLLAPSIBLE_ABOVE_ELEMENTS = 64;

export type RegionLayoutKind = 'matrix' | 'words' | 'rows';

/** How a `words` region (producer hint `RegionSpec.layout`) is drawn: one grid row per word. */
export interface WordRows {
  /** Elements per word (`wordBytes / elemBytes(elem)`). */
  elemsPerWord: number;
  /** Words shown side by side on one line (`wordsPerGroup`, e.g. the 4 words of an AES round key). */
  wordsPerLine: number;
  /** Row header symbol before the word index, e.g. `w` → `w0`, `w1`, … */
  labelPrefix: string;
}

export interface RegionLayout {
  kind: RegionLayoutKind;
  shape: GridShape;
  order: 'row-major' | 'col-major';
  /** Offset gutter for long byte rows; `undefined` otherwise. */
  rowOffsets?: number[];
  /** Word rows of a `words` layout; `undefined` otherwise. */
  words?: WordRows;
}

type WordsHint = Extract<NonNullable<RegionSpec<string>['layout']>, { kind: 'words' }>;

export function isMatrixRegion(region: Pick<RegionSpec<string>, 'shape'>): boolean {
  return region.shape.length === 2 && region.shape.every((dim) => dim <= MATRIX_MAX_DIM);
}

function byteRowsLayout(region: RegionSpec<string>): RegionLayout {
  const size = regionSize(region);
  const width = Math.min(BYTES_PER_ROW, size);
  const rowCount = Math.ceil(size / width);
  return { kind: 'rows', shape: [rowCount, width], order: 'row-major', rowOffsets: Array.from({ length: rowCount }, (_, row) => row * width) };
}

function wordsLayout(region: RegionSpec<string>, hint: WordsHint): RegionLayout {
  const elemsPerWord = Math.max(1, Math.round(hint.wordBytes / elemBytes(region.elem)));
  const words = { elemsPerWord, wordsPerLine: Math.max(1, hint.wordsPerGroup ?? 1), labelPrefix: hint.labelPrefix ?? '' };
  return { kind: 'words', shape: [Math.ceil(regionSize(region) / elemsPerWord), elemsPerWord], order: 'row-major', words };
}

/**
 * The producer's layout hint decides: `words` → one labelled row per word, `wordsPerGroup` per line.
 * Without a hint (or `grid`): small 2-D regions → matrix in their own order; anything else → rows
 * of 16 with offsets.
 */
export function regionLayout(region: RegionSpec<string>): RegionLayout {
  if (region.layout?.kind === 'words') return wordsLayout(region, region.layout);
  if (!isMatrixRegion(region)) return byteRowsLayout(region);
  const [rows = 1, cols = 1] = region.shape;
  return { kind: 'matrix', shape: [rows, cols], order: region.order ?? 'row-major' };
}

/** The current step's highlights for one region (none at the initial state). */
export function regionHighlights(step: Pick<StateStep<string, { op: string }>, 'highlights'> | undefined, regionId: string): GridHighlight[] {
  return (step?.highlights ?? []).filter((highlight: Highlight<string>) => highlight.region === regionId);
}

/** Large regions go into a disclosure so they never push the rest of the lab off a small screen. */
export function isCollapsibleRegion(region: Pick<RegionSpec<string>, 'shape'>): boolean {
  return regionSize(region) > COLLAPSIBLE_ABOVE_ELEMENTS;
}

/** Size of a region in bytes (elements × element width). */
export function regionByteSize(region: Pick<RegionSpec<string>, 'shape' | 'elem'>): number {
  return regionSize(region) * elemBytes(region.elem);
}
