import type { I18nRef } from '../i18n.ts';
import { isIndex } from './validation.ts';

/** Wire facet: bytes as they travel (docs/M3.md §6). */

export type WireRole = 'iv' | 'nonce' | 'ciphertext' | 'padding' | 'tag' | 'plaintext';

export interface WireSegment {
  id: string;
  role: WireRole;
  label: I18nRef;
  bytes: number[];
  valueRef?: string;
  block?: number;
}

export interface WireFacet {
  kind: 'wire';
  schemaVersion: 1;
  segments: WireSegment[];
  /** If set, clicking a bit/byte flips it via requestParams({ [flipParam]: newMaskHex }). */
  flip?: { param: string; maskHex: string };
  /** Per-step highlight: which byte offsets (over the concatenated segments) are active. */
  activeAt?: { step: number; offsets: number[] }[];
}

export interface WireSegmentHit {
  segment: WireSegment;
  /** Index of the segment in `facet.segments`. */
  index: number;
  /** Global offset of the segment's first byte. */
  start: number;
  /** Offset within the segment. */
  byteIndex: number;
}

const LOWER_HEX_BYTES = /^(?:[0-9a-f]{2})*$/;

/** Byte length of all segments concatenated. */
export function wireTotalLength(facet: WireFacet): number {
  return facet.segments.reduce((total, segment) => total + segment.bytes.length, 0);
}

/** The segment holding global byte `offset`, or undefined when out of range. */
export function wireSegmentAt(facet: WireFacet, offset: number): WireSegmentHit | undefined {
  let start = 0;
  for (const [index, segment] of facet.segments.entries()) {
    const byteIndex = offset - start;
    if (isIndex(byteIndex, segment.bytes.length)) return { segment, index, start, byteIndex };
    start += segment.bytes.length;
  }
  return undefined;
}

function duplicateIdIssues(facet: WireFacet): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const { id } of facet.segments) {
    if (seen.has(id)) issues.push(`wire: duplicate segment id "${id}"`);
    seen.add(id);
  }
  return issues;
}

function flipIssues(facet: WireFacet, total: number): string[] {
  if (facet.flip === undefined) return [];
  const { maskHex } = facet.flip;
  if (!LOWER_HEX_BYTES.test(maskHex)) return [`wire: flip mask "${maskHex}" is not lowercase hex`];
  const bytes = maskHex.length / 2;
  return bytes === total ? [] : [`wire: flip mask is ${bytes} bytes, segments total ${total}`];
}

function activeAtIssues(facet: WireFacet, stepCount: number, total: number): string[] {
  const issues: string[] = [];
  let previous: number | undefined;
  for (const { step, offsets } of facet.activeAt ?? []) {
    if (previous !== undefined && step <= previous) issues.push(`wire: activeAt step ${step} does not follow step ${previous}`);
    if (!Number.isInteger(step) || step < -1 || step > stepCount - 1) issues.push(`wire: activeAt step ${step} outside -1..${stepCount - 1}`);
    for (const offset of offsets) if (!isIndex(offset, total)) issues.push(`wire: activeAt step ${step} offset ${offset} outside 0..${total - 1}`);
    previous = step;
  }
  return issues;
}

/** Structural problems of a wire facet (empty = valid): ids, flip mask, step order and range, offsets. */
export function wireIssues(facet: WireFacet, stepCount: number): string[] {
  const total = wireTotalLength(facet);
  return [...duplicateIdIssues(facet), ...flipIssues(facet, total), ...activeAtIssues(facet, stepCount, total)];
}

/** Offsets highlighted at `step`: the latest `activeAt` entry with step ≤ `step`, else none. */
export function wireActiveOffsetsAt(facet: WireFacet, step: number): number[] {
  const entry = (facet.activeAt ?? []).findLast((candidate) => candidate.step <= step);
  return entry?.offsets ?? [];
}

/** Every I18nRef the facet renders: segment labels (for the contract kit). */
export function wireLabelRefs(facet: WireFacet): I18nRef[] {
  return facet.segments.map((segment) => segment.label);
}
