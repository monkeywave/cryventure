import { parseHex, wireActiveOffsetsAt, type WireFacet, type WireRole, type WireSegment } from '@cryventure/core';

/** Pure helpers of the wire view: segment placement, rows of 16, highlights and the flip mask. */

export const BYTES_PER_ROW = 16;

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
  /** Rows of at most `BYTES_PER_ROW` bytes. */
  rows: PlacedByte[][];
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

/** Segments with their global start, bytes in rows of 16, and what is lit at `step`. */
export function placeSegments(facet: WireFacet, step: number): PlacedSegment[] {
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
      rows: chunk(bytes, BYTES_PER_ROW),
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
