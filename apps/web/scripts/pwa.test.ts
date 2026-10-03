import { describe, expect, it } from 'vitest';
import {
  assertPrecacheBudget,
  buildManifest,
  formatMegabytes,
  isPwaEnabled,
  MAX_FILE_BYTES,
  normalizeBase,
  PRECACHE_BUDGET_BYTES,
  workboxOptions,
} from './pwa.mjs';

describe('isPwaEnabled', () => {
  it('is on unless CV_PWA is exactly "false"', () => {
    expect(isPwaEnabled({})).toBe(true);
    expect(isPwaEnabled({ CV_PWA: 'true' })).toBe(true);
    expect(isPwaEnabled({ CV_PWA: 'false' })).toBe(false);
  });
});

describe('normalizeBase', () => {
  it.each([
    [undefined, '/'],
    ['/', '/'],
    ['', '/'],
    ['/cryventure/', '/cryventure/'],
    ['cryventure', '/cryventure/'],
    ['/cryventure', '/cryventure/'],
    ['//a/b//', '/a/b/'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeBase(raw)).toBe(expected);
  });
});

describe('buildManifest', () => {
  it('derives scope, start_url and icon URLs from the base', () => {
    const manifest = buildManifest('/cryventure/');
    expect(manifest).toMatchObject({ name: 'CryVenture', scope: '/cryventure/', start_url: '/cryventure/', id: '/cryventure/' });
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/cryventure/icons/icon-192.png',
      '/cryventure/icons/icon-512.png',
      '/cryventure/icons/maskable-192.png',
      '/cryventure/icons/maskable-512.png',
    ]);
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(2);
  });

  it('uses the origin root for base "/"', () => {
    expect(buildManifest('/')).toMatchObject({ scope: '/', start_url: '/' });
  });
});

describe('workboxOptions', () => {
  const options = workboxOptions({ distDir: '/x/dist', base: '/cryventure/' });

  it('writes the worker to the base root and prefixes precache URLs with the base', () => {
    expect(options.swDest).toBe('/x/dist/sw.js');
    expect(options.modifyURLPrefix).toEqual({ '': '/cryventure/' });
  });

  it('precaches Pagefind and serves directory URLs without a navigation fallback', () => {
    expect(options.globPatterns).toContain('pagefind/**/*');
    expect(options).toMatchObject({ navigateFallback: null, directoryIndex: 'index.html', skipWaiting: false, cleanupOutdatedCaches: true });
    expect(options.maximumFileSizeToCacheInBytes).toBe(MAX_FILE_BYTES);
  });

  it('ignores query parameters (Pagefind cache-busting, lab links)', () => {
    expect(options.ignoreURLParametersMatching.some((pattern) => pattern.test('ts'))).toBe(true);
  });
});

describe('assertPrecacheBudget', () => {
  it('passes up to the budget and throws above it', () => {
    expect(() => assertPrecacheBudget(PRECACHE_BUDGET_BYTES)).not.toThrow();
    expect(() => assertPrecacheBudget(PRECACHE_BUDGET_BYTES + 1)).toThrow(/above the 25\.00 MB budget/);
  });

  it('formats sizes in MB', () => {
    expect(formatMegabytes(3.5 * 1024 * 1024)).toBe('3.50 MB');
  });
});
