/**
 * The shape of a facet variant name, as derivers produce them (`x86_64-aesni`, one id per implementation) and lessons
 * prefer them (`<Lab variant="x86_64-aesni">`): lower-case tokens of `[a-z0-9_]` joined by single
 * `-`, `+` or `.` (docs/M4.md §1f). Deriver profiles are not static, so `<Lab>` can only check the
 * format at build time, not that some deriver will produce the name.
 */
const VARIANT_NAME = /^[a-z0-9_]+(?:[-+.][a-z0-9_]+)*$/;

export function isVariantName(value: unknown): value is string {
  return typeof value === 'string' && VARIANT_NAME.test(value);
}
