import { INITIAL_STEP, type AnyStateFacet } from '@cryventure/viz';
import type { NodeRef } from '@cryventure/core';

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

/**
 * Value history of one node up to and including `uptoStep`: the initial value, then every step that
 * changed it; only the last `limit` entries are kept.
 */
export function watchHistory(facet: AnyStateFacet, node: NodeRef, uptoStep: number, limit: number = WATCH_LIMIT): WatchEntry[] {
  const initial = facet.initial[node.region]?.[node.index];
  if (initial === undefined) return [];
  const entries: WatchEntry[] = [{ step: INITIAL_STEP, value: initial }];
  for (let step = 0; step <= uptoStep && step < facet.steps.length; step++) {
    const value = writtenValue(facet.steps[step]!, node);
    if (value !== undefined && value !== entries.at(-1)!.value) entries.push({ step, value });
  }
  return entries.slice(-limit);
}

/** Bar height of a value, 0..1 of the element type's range (u8 by default). */
export function watchLevel(value: number, maxValue: number = 0xff): number {
  return maxValue <= 0 ? 0 : Math.min(1, Math.max(0, value / maxValue));
}
