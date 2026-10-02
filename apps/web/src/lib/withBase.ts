/**
 * Joins a site-relative path onto a base path without producing double slashes.
 * A trailing slash on `path` is preserved; an empty path yields the base itself.
 */
export function joinBase(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const relativePath = path.replace(/^\/+/, '');
  return `${normalizedBase}${relativePath}`;
}

/** Prefixes `path` with the configured Astro base (`import.meta.env.BASE_URL`). */
export function withBase(path: string): string {
  return joinBase(import.meta.env.BASE_URL ?? '/', path);
}
