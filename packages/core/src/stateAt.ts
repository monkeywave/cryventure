import { applyWrites, type Keyframe, type Snapshot, type StateFacet } from './facets/state.ts';

type AnyStateFacet = StateFacet<string, { op: string }>;

export const STATE_CACHE_CAPACITY = 64;

const cache = new WeakMap<object, Map<number, Snapshot<string>>>();

/** Last keyframe with `keyframe.step <= step` (keyframes are sorted ascending), via binary search. */
export function nearestKeyframe<R extends string>(keyframes: readonly Keyframe<R>[], step: number): Keyframe<R> | undefined {
  let low = 0;
  let high = keyframes.length - 1;
  let best: Keyframe<R> | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = keyframes[mid];
    if (candidate === undefined) break;
    if (candidate.step <= step) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function assertStepInRange(facet: AnyStateFacet, step: number): void {
  if (!Number.isInteger(step) || step < -1 || step >= facet.steps.length) {
    throw new RangeError(`stateAt: step ${step} outside [-1, ${facet.steps.length - 1}]`);
  }
}

function replayFrom<R extends string>(facet: StateFacet<R, { op: string }>, step: number): Snapshot<R> {
  const keyframe = nearestKeyframe(facet.keyframes, step);
  let snapshot = keyframe?.snapshot ?? facet.initial;
  for (let i = (keyframe?.step ?? -1) + 1; i <= step; i++) {
    snapshot = applyWrites(snapshot, facet.steps[i]?.writes ?? []);
  }
  return snapshot;
}

function cacheFor(facet: object): Map<number, Snapshot<string>> {
  let entries = cache.get(facet);
  if (entries === undefined) {
    entries = new Map();
    cache.set(facet, entries);
  }
  return entries;
}

function remember(entries: Map<number, Snapshot<string>>, step: number, snapshot: Snapshot<string>): void {
  entries.delete(step);
  entries.set(step, snapshot);
  if (entries.size > STATE_CACHE_CAPACITY) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
}

/**
 * State AFTER `step` (step `-1` = `initial`): nearest keyframe ≤ step, then replay deltas.
 * Results are memoised in a small per-facet LRU; facets must be treated as immutable.
 */
export function stateAt<R extends string>(facet: StateFacet<R, { op: string }>, step: number): Snapshot<R> {
  assertStepInRange(facet, step);
  if (step === -1) return facet.initial;
  const entries = cacheFor(facet);
  const snapshot = (entries.get(step) as Snapshot<R> | undefined) ?? replayFrom(facet, step);
  remember(entries, step, snapshot);
  return snapshot;
}
