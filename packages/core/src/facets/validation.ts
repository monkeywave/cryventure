/** Small shared predicates for facet validators (internal to core facets). */

/** Whether `value` is an integer in `0..length-1`. */
export function isIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length;
}
