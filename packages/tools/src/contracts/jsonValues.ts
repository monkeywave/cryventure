/**
 * Values that would not survive a JSON round trip unchanged, with their path (empty = serializable).
 * `undefined` object properties are allowed (JSON drops them, and optional fields are often set
 * so); `undefined` array items, non-finite numbers, bigint, functions, symbols and class
 * instances (Map, Set, typed arrays, Date, …) are not.
 */
export function jsonValueProblems(value: unknown, path = '$'): string[] {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${path}: ${value} is not a finite number`];
  if (Array.isArray(value)) return value.flatMap((item, index) => (item === undefined ? [`${path}[${index}]: undefined`] : jsonValueProblems(item, `${path}[${index}]`)));
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) return [`${path}: ${value.constructor.name} is not a plain object`];
    return Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : jsonValueProblems(item, `${path}.${key}`)));
  }
  return [`${path}: ${typeof value} is not JSON`];
}
