import type { Page } from '@playwright/test';
import type { Lang } from './labPage.ts';

// The M6 hash lessons (docs/M6.md §7), shared by the hash2*.spec.ts suites.

export interface HashLesson {
  slug: string;
  /** EN title; the DE title is whatever the translation says, but never the EN one. */
  titleEn: string;
  labIds: readonly string[];
}

export const M6_HASH_LESSONS: readonly HashLesson[] = [
  { slug: 'hash/md5-sha1/', titleEn: 'MD5 and SHA-1: the broken ancestors', labIds: ['md5-abc', 'sha1-abc'] },
  { slug: 'hash/sponge/', titleEn: 'The sponge: SHA-3 and SHAKE', labIds: ['sha3-256-abc-permutation', 'shake128-abc-336', 'cshake128-sample1'] },
  { slug: 'hash/keccak/', titleEn: 'Inside Keccak-f[1600]', labIds: ['sha3-256-abc', 'keccak-rc', 'keccak-rho', 'sha3-256-armv8'] },
  { slug: 'hash/blake2/', titleEn: 'BLAKE2: hashing with add, rotate, XOR', labIds: ['blake2s-256-abc', 'blake2b-512-abc-round', 'blake2s-256-keyed'] },
];

/** Sidebar order of the "Hash functions" group (docs/M6.md §7). */
export const HASH_SIDEBAR_ORDER = ['hash/', 'hash/sha256/', 'hash/sha512/', 'hash/md5-sha1/', 'hash/sponge/', 'hash/keccak/', 'hash/blake2/'] as const;

export const LANGS: readonly Lang[] = ['en', 'de'];

/** Console errors and uncaught exceptions from now on; read the array after the page settled. */
export function recordPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}
