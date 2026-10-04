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

/** Whether `value` is a non-null, non-array object. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether `ref` is an `I18nRef`: a non-empty `key`, and `params` (if any) a record of strings and numbers. */
export function isWellFormedI18nRef(ref: unknown): boolean {
  if (!isPlainRecord(ref) || typeof ref.key !== 'string' || ref.key === '') return false;
  if (ref.params === undefined) return true;
  return isPlainRecord(ref.params) && Object.values(ref.params).every((value) => typeof value === 'string' || Number.isFinite(value));
}

/** `where: not a well-formed I18nRef` unless `ref` is one. */
export function i18nRefProblems(ref: unknown, where: string): string[] {
  return isWellFormedI18nRef(ref) ? [] : [`${where}: not a well-formed I18nRef`];
}

/** `<kind>: kind … is not "<kind>"` unless `facet.kind` is `kind` (validators check it first). */
export function kindProblems(facet: { readonly kind?: unknown }, kind: string): string[] {
  return facet.kind === kind ? [] : [`${kind}: kind ${describeValue(facet.kind)} is not "${kind}"`];
}

/** `where: stepCount … is not a non-negative integer` unless `stepCount` is absent or one (NaN would accept every step). */
export function stepCountProblems(stepCount: number | undefined, where: string): string[] {
  return stepCount === undefined || (Number.isInteger(stepCount) && stepCount >= 0) ? [] : [`${where}: stepCount ${describeValue(stepCount)} is not a non-negative integer`];
}

/** Whether `hex` is a string of exactly `digits` lowercase hex digits. */
export function isLowerHex(hex: unknown, digits: number): boolean {
  return typeof hex === 'string' && hex.length === digits && /^[0-9a-f]*$/.test(hex);
}

/** `value` for a problem message, without ever throwing (strings and numbers as is, anything else by type). */
export function describeValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value === null || value === undefined) return String(value);
  return Array.isArray(value) ? '<array>' : `<${typeof value}>`;
}
