import { byteToHex, hexDigits, parseHex, toHex, type WireFacet, type WireSegment } from '@cryventure/core';

/** Pure helpers of the wire view: segment placement, rows of 16/8/4, highlight change steps and the flip mask. */

export const BYTES_PER_ROW = 16;
/** Row widths the strip wraps to, widest first. */
const ROW_WIDTHS = [16, 8, 4] as const;
const NARROWEST_ROW = 4;
/** Pitch of one byte box at its minimum width, gap included (em of the strip; mirrors wire.css). */
export const WIRE_BOX_PITCH_EM = 1.5;
/** Offsets ruler plus the segment's start border and padding (em of the strip; mirrors wire.css). */
export const WIRE_GUTTER_EM = 3.75;

export interface PlacedByte {
  value: number;
  /** Two hex digits of `value`. */
  hex: string;
  /** Global offset over the concatenated segments. */
  offset: number;
  /** Bits the flip mask sets in this byte (0 = untouched). */
  flipMask: number;
}

/** A segment's static placement: independent of the step, so it is built once per facet and row width. */
export interface PlacedSegment {
  segment: WireSegment;
  start: number;
  /** Rows of at most `bytesPerRow` bytes. */
  rows: PlacedByte[][];
  /** The segment's bytes as hex in groups of 4 (for its summary). */
  hex: string;
  flippedCount: number;
}

function flipMaskBytes(facet: WireFacet): number[] {
  if (facet.flip === undefined) return [];
  const parsed = parseHex(facet.flip.maskHex);
  return parsed.ok ? Array.from(parsed.bytes) : [];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Bytes per row that fit a strip `width` px wide (em = `emPx`) with every box at least its minimum
 * width: 16, 8 or 4 (4 is the floor). Unmeasured (SSR, first render) keeps 16.
 */
export function fitBytesPerRow(width: number | undefined, emPx: number): number {
  if (width === undefined || width <= 0) return BYTES_PER_ROW;
  return ROW_WIDTHS.find((perRow) => (WIRE_GUTTER_EM + perRow * WIRE_BOX_PITCH_EM) * emPx <= width) ?? NARROWEST_ROW;
}

/**
 * The last step at or before `step` at which the highlights changed: `wireActiveOffsetsAt` gives
 * equal results for both, so memoising on it skips the steps in between.
 */
export function wireChangeStep(facet: WireFacet, step: number): number {
  const changes = (facet.activeAt ?? []).map((entry) => entry.step);
  return Math.max(Math.min(step, -1), ...changes.filter((change) => change <= step));
}

/** Segments with their global start and bytes in rows of `bytesPerRow`; the step-dependent state (sent, lit) stays out. */
export function placeSegments(facet: WireFacet, bytesPerRow: number = BYTES_PER_ROW): PlacedSegment[] {
  const mask = flipMaskBytes(facet);
  let start = 0;
  return facet.segments.map((segment) => {
    const bytes = segment.bytes.map((value, index) => {
      const offset = start + index;
      return { value, hex: byteToHex(value), offset, flipMask: mask[offset] ?? 0 };
    });
    const placed = {
      segment,
      start,
      rows: chunk(bytes, bytesPerRow),
      hex: toHex(segment.bytes, { group: 4 }),
      flippedCount: bytes.filter((byte) => byte.flipMask !== 0).length,
    };
    start += segment.bytes.length;
    return placed;
  });
}

/** Offsets of `placed` lit in `active`. */
export function countActive(placed: PlacedSegment, active: ReadonlySet<number>): number {
  return placed.segment.bytes.reduce((count, _, index) => count + (active.has(placed.start + index) ? 1 : 0), 0);
}

/** Offset label of the ruler, e.g. `0x10`; four digits once the strip passes 255 bytes. */
export function offsetLabel(offset: number, total: number): string {
  return `0x${hexDigits(offset, total > 0x100 ? 4 : 2)}`;
}
