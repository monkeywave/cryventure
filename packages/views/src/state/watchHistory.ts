import { nodeId, type AnyStateFacet, type NodeRef } from '@cryventure/core';
import { INITIAL_STEP } from '@cryventure/viz';

export interface WatchEntry {
  /** Step that wrote the value (`-1` = initial state). */
  step: number;
  value: number;
}

/** Default number of history entries shown. */
export const WATCH_LIMIT = 8;

function writtenValue(step: AnyStateFacet['steps'][number], node: NodeRef): number | undefined {
  let value: number | undefined;
  for (const write of step.writes) {
    const offset = node.index - write.offset;
    if (write.region === node.region && offset >= 0 && offset < write.values.length) value = write.values[offset];
  }
  return value;
}

/** Every change of one node over the whole facet: the initial value, then each step that changed it. */
function changePoints(facet: AnyStateFacet, node: NodeRef): readonly WatchEntry[] {
  const initial = facet.initial[node.region]?.[node.index];
  if (initial === undefined) return [];
  const entries: WatchEntry[] = [{ step: INITIAL_STEP, value: initial }];
  facet.steps.forEach((step, index) => {
    const value = writtenValue(step, node);
    if (value !== undefined && value !== entries.at(-1)!.value) entries.push({ step: index, value });
  });
  return entries;
}

const changeCache = new WeakMap<AnyStateFacet, Map<string, readonly WatchEntry[]>>();

/** `changePoints`, computed once per (facet, node); facets are immutable. */
export function nodeChanges(facet: AnyStateFacet, node: NodeRef): readonly WatchEntry[] {
  let byNode = changeCache.get(facet);
  if (byNode === undefined) changeCache.set(facet, (byNode = new Map()));
  const key = nodeId(node);
  let changes = byNode.get(key);
  if (changes === undefined) byNode.set(key, (changes = changePoints(facet, node)));
  return changes;
}

/** Number of entries with `step ≤ uptoStep` (entries are sorted by step): a binary search. */
function countUpTo(entries: readonly WatchEntry[], uptoStep: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle]!.step <= uptoStep) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Value history of one node up to and including `uptoStep`: the initial value, then every step that
 * changed it; only the last `limit` entries are kept. The changes are computed once per node and
 * the playhead is found by binary search, so moving the playhead costs O(log steps).
 */
export function watchHistory(facet: AnyStateFacet, node: NodeRef, uptoStep: number, limit: number = WATCH_LIMIT): WatchEntry[] {
  const changes = nodeChanges(facet, node);
  // The initial value is always part of the history (as before any step).
  const end = Math.max(Math.min(1, changes.length), countUpTo(changes, uptoStep));
  return changes.slice(Math.max(0, end - limit), end);
}

/** Bar height of a value, 0..1 of the element type's range (u8 by default). */
export function watchLevel(value: number, maxValue: number = 0xff): number {
  return maxValue <= 0 ? 0 : Math.min(1, Math.max(0, value / maxValue));
}
