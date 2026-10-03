import { describe, expect, it, vi } from 'vitest';
import {
  assertPrecacheBudget,
  buildManifest,
  formatMegabytes,
  isPwaEnabled,
  MAX_FILE_BYTES,
  normalizeBase,
  PRECACHE_BUDGET_BYTES,
  selfUnregisteringWorker,
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

describe('selfUnregisteringWorker', () => {
  type Handler = (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;

  /** Runs the worker source against a fake service-worker global; returns its spies. */
  function runWorker() {
    const handlers: Record<string, Handler> = {};
    const scope = 'https://example.org/cryventure/';
    const cacheNames = [`workbox-precache-v2-${scope}`, `workbox-runtime-${scope}`, 'workbox-precache-v2-https://example.org/other-app/'];
    const client = { url: `${scope}en/`, navigate: vi.fn(async () => undefined) };
    const self = {
      addEventListener: (type: string, handler: Handler) => (handlers[type] = handler),
      skipWaiting: vi.fn(async () => undefined),
      registration: { scope, unregister: vi.fn(async () => true) },
      clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => [client]) },
    };
    const caches = { keys: vi.fn(async () => cacheNames), delete: vi.fn(async (_name: string) => true) };
    new Function('self', 'caches', selfUnregisteringWorker())(self, caches);
    const fire = async (type: string) => {
      const pending: Promise<unknown>[] = [];
      handlers[type]?.({ waitUntil: (promise) => pending.push(promise) });
      await Promise.all(pending);
    };
    return { self, caches, client, fire };
  }

  it('activates at once, clears only its own scope’s caches, unregisters and reloads its pages', async () => {
    const { self, caches, client, fire } = runWorker();
    await fire('install');
    expect(self.skipWaiting).toHaveBeenCalled();
    await fire('activate');
    expect(caches.delete.mock.calls.map(([name]) => name)).toEqual(['workbox-precache-v2-https://example.org/cryventure/', 'workbox-runtime-https://example.org/cryventure/']);
    expect(self.registration.unregister).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith('https://example.org/cryventure/en/');
  });

  it('has no fetch handler, so nothing is served from it', () => {
    expect(selfUnregisteringWorker()).not.toMatch(/['"]fetch['"]/);
  });
});
