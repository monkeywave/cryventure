/** Per list, how many leading entries are known to be strictly increasing (lists are checked once, rechecked when they grow). */
const checkedLengths = new WeakMap<readonly { readonly step: number }[], number>();

/** Throws a `RangeError` unless `steps` is strictly increasing by `step` (O(n) once per list and length). */
function assertStrictlyIncreasing(steps: readonly { readonly step: number }[]): void {
  const checked = checkedLengths.get(steps) ?? 0;
  if (checked === steps.length) return;
  for (let index = Math.max(1, checked); index < steps.length; index++) {
    if (!(steps[index]!.step > steps[index - 1]!.step)) throw new RangeError(`latestStepAt: steps are not strictly increasing at index ${index}`);
  }
  checkedLengths.set(steps, steps.length);
}

/**
 * The last entry whose `step ≤ playhead` in a list sorted by strictly increasing `step` (binary
 * search), or `undefined` before the first entry or for an empty list. Sparse per-step facets
 * (math, field, wordops, sponge, …) keep showing their last entry between their steps
 * (docs/M6.md §3d). Unsorted input (which a binary search would silently misread) throws a
 * `RangeError`; the check runs once per list (again when it grew), so playback stays O(log n).
 */
export function latestStepAt<T extends { readonly step: number }>(steps: readonly T[], playhead: number): T | undefined {
  assertStrictlyIncreasing(steps);
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
