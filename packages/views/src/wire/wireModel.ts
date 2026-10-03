import { isWireSegmentAvailable, parseHex, wireActiveOffsetsAt, type WireFacet, type WireRole, type WireSegment } from '@cryventure/core';

/** Pure helpers of the wire view: segment placement, rows of 16/8/4, availability, highlights and the flip mask. */

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
  /** Global offset over the concatenated segments. */
  offset: number;
  active: boolean;
  /** Bits the flip mask sets in this byte (0 = untouched). */
  flipMask: number;
}

export interface PlacedSegment {
  segment: WireSegment;
  start: number;
  /** Rows of at most `bytesPerRow` bytes. */
  rows: PlacedByte[][];
  /** Not sent yet at the step (before the segment's `availableAt`): value withheld. */
  pending: boolean;
  activeCount: number;
  flippedCount: number;
}

/** Non-colour cue per role (PLAN §3: dice for nonce/IV randomness). Decorative only. */
export const ROLE_GLYPHS: Readonly<Record<WireRole, string>> = {
  iv: '⚄',
  nonce: '⚄',
  ciphertext: '◆',
  plaintext: '◇',
  padding: '░',
  tag: '✓',
};

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
 * The last step at or before `step` at which the highlights or a segment's availability changed:
 * `placeSegments` gives equal results for both, so memoising on it skips the steps in between.
 */
export function wireChangeStep(facet: WireFacet, step: number): number {
  const changes = [...(facet.activeAt ?? []).map((entry) => entry.step), ...facet.segments.flatMap((segment) => (segment.availableAt === undefined ? [] : [segment.availableAt]))];
  return Math.max(Math.min(step, -1), ...changes.filter((change) => change <= step));
}

/** Segments with their global start, bytes in rows of `bytesPerRow`, and what is sent and lit at `step`. */
export function placeSegments(facet: WireFacet, step: number, bytesPerRow: number = BYTES_PER_ROW): PlacedSegment[] {
  const active = new Set(wireActiveOffsetsAt(facet, step));
  const mask = flipMaskBytes(facet);
  let start = 0;
  return facet.segments.map((segment) => {
    const bytes = segment.bytes.map((value, index) => {
      const offset = start + index;
      return { value, offset, active: active.has(offset), flipMask: mask[offset] ?? 0 };
    });
    const placed = {
      segment,
      start,
      rows: chunk(bytes, bytesPerRow),
      pending: !isWireSegmentAvailable(segment, step),
      activeCount: bytes.filter((byte) => byte.active).length,
      flippedCount: bytes.filter((byte) => byte.flipMask !== 0).length,
    };
    start += segment.bytes.length;
    return placed;
  });
}

/** Offset label of the ruler, e.g. `0x10`; four digits once the strip passes 255 bytes. */
export function offsetLabel(offset: number, total: number): string {
  return `0x${offset.toString(16).padStart(total > 0x100 ? 4 : 2, '0')}`;
}
