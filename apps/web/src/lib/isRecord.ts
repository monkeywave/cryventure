/** A plain object (not `null`, not an array): a JSON record whose fields can be read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
