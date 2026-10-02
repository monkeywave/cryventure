import { regionSize, type Highlight, type RegionSpec, type StateStep } from '@cryventure/core';
import type { GridHighlight, GridShape } from '@cryventure/viz';

/** Regions up to this many rows/columns render as a matrix; longer ones as hex rows. */
export const MATRIX_MAX_DIM = 8;
export const BYTES_PER_ROW = 16;
/** A region of shape `[n, WORD_BYTES]` with `n > WORD_BYTES` is a list of 32-bit words (e.g. a key schedule). */
export const WORD_BYTES = 4;

export type RegionLayoutKind = 'matrix' | 'words' | 'rows';

export interface RegionLayout {
  kind: RegionLayoutKind;
  shape: GridShape;
  order: 'row-major' | 'col-major';
  /** Offset gutter for long byte rows; `undefined` otherwise. */
  rowOffsets?: number[];
}

/** `[n, 4]` with more than four rows: one row per word, so it renders as labelled words. */
export function isWordRegion(region: Pick<RegionSpec<string>, 'shape'>): boolean {
  const [rows = 0, cols = 0] = region.shape;
  return region.shape.length === 2 && cols === WORD_BYTES && rows > WORD_BYTES;
}

export function isMatrixRegion(region: Pick<RegionSpec<string>, 'shape'>): boolean {
  return region.shape.length === 2 && region.shape.every((dim) => dim <= MATRIX_MAX_DIM) && !isWordRegion(region);
}

function byteRowsLayout(region: RegionSpec<string>): RegionLayout {
  const size = regionSize(region);
  const width = Math.min(BYTES_PER_ROW, size);
  const rowCount = Math.ceil(size / width);
  return { kind: 'rows', shape: [rowCount, width], order: 'row-major', rowOffsets: Array.from({ length: rowCount }, (_, row) => row * width) };
}

/** 4×4 state → matrix in its own order; `[n,4]` → word rows; anything else → rows of 16 with offsets. */
export function regionLayout(region: RegionSpec<string>): RegionLayout {
  const [rows = 1, cols = 1] = region.shape;
  if (isWordRegion(region)) return { kind: 'words', shape: [rows, cols], order: 'row-major' };
  if (isMatrixRegion(region)) return { kind: 'matrix', shape: [rows, cols], order: region.order ?? 'row-major' };
  return byteRowsLayout(region);
}

/** The current step's highlights for one region (none at the initial state). */
export function regionHighlights(step: Pick<StateStep<string, { op: string }>, 'highlights'> | undefined, regionId: string): GridHighlight[] {
  return (step?.highlights ?? []).filter((highlight: Highlight<string>) => highlight.region === regionId);
}
