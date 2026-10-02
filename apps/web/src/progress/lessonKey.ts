import { isLocale } from '@cryventure/core';

function stripBase(pathname: string, base: string): string {
  const normalizedBase = `/${base.replace(/^\/+|\/+$/g, '')}`;
  if (normalizedBase === '/') return pathname;
  if (pathname === normalizedBase) return '/';
  return pathname.startsWith(`${normalizedBase}/`) ? pathname.slice(normalizedBase.length) : pathname;
}

/**
 * The page slug without base, locale and surrounding slashes, so EN and DE share progress:
 * `/cryventure/de/symmetric/aes/subbytes-sbox/` with base `/cryventure/` → `symmetric/aes/subbytes-sbox`.
 */
export function lessonKeyFromPath(pathname: string, base: string): string {
  const segments = stripBase(pathname, base).split('/').filter((segment) => segment !== '');
  if (isLocale(segments[0])) segments.shift();
  return segments.join('/');
}
