/**
 * The last entry whose `step ≤ playhead` in a list sorted by strictly increasing `step` (binary
 * search), or `undefined` before the first entry or for an empty list. Sparse per-step facets
 * (math, field, wordops, sponge, …) keep showing their last entry between their steps
 * (docs/M6.md §3d).
 */
export function latestStepAt<T extends { readonly step: number }>(steps: readonly T[], playhead: number): T | undefined {
  let low = 0;
  let high = steps.length - 1;
  let found: T | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = steps[mid]!;
    if (candidate.step <= playhead) {
      found = candidate;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}
