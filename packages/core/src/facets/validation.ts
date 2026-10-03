/** Small shared predicates for facet validators (internal to core facets). */

/** Whether `value` is an integer in `0..length-1`. */
export function isIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length;
}

/** Step index of the initial state (before step 0); narration and math facets may have an entry there. */
export const INITIAL_STEP_INDEX = -1;

/** Whether `value` is a facet step index: an integer ≥ −1 (−1 = the initial state). */
export function isStepIndex(value: number): boolean {
  return Number.isInteger(value) && value >= INITIAL_STEP_INDEX;
}
