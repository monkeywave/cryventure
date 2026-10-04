/**
 * The latest entry whose `step ≤ step` in a list sorted by step (binary search), or `undefined` before
 * the first. Views with sparse per-step facets keep showing the last entry between them. Same lookup
 * as core's `mathStepAt`/`fieldStepAt`, generic so view-local facets need not copy it.
 */
export function latestStepAt<T extends { step: number }>(steps: readonly T[], step: number): T | undefined {
  let low = 0;
  let high = steps.length - 1;
  let found: T | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = steps[mid]!;
    if (candidate.step <= step) {
      found = candidate;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}
