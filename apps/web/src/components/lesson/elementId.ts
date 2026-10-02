let counter = 0;

/**
 * A document-unique id for server-rendered components (Astro has no `useId`): `prefix-1`, `prefix-2`, …
 * The counter only grows, so ids never repeat within a page, nor across pages of one build.
 */
export function nextElementId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
