// @ts-check
/**
 * Pure PWA helpers shared by `build-sw.mjs` (docs/M3.md §11). No I/O here, so they are unit tested
 * in `pwa.test.ts`. Plain ESM + JSDoc because the post-build script runs on bare Node.
 */

/** Hard budget for everything the service worker precaches. */
export const PRECACHE_BUDGET_BYTES = 25 * 1024 * 1024;
/** Per-file cap; anything larger is left out of the precache (Workbox warns about it). */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const SW_FILENAME = 'sw.js';
export const MANIFEST_FILENAME = 'manifest.webmanifest';

/** Theme colours from `src/styles/tokens.css` (dark theme, the default): `--cv-bg`. */
export const THEME_COLOR = '#050811';

/**
 * `CV_PWA=false` turns the service worker and manifest off (PR previews, dev).
 * @param {Record<string, string | undefined>} env
 */
export function isPwaEnabled(env) {
  return env.CV_PWA !== 'false';
}

/**
 * Normalises `CV_BASE` the way Astro uses it: leading and trailing slash (`cryventure` → `/cryventure/`).
 * @param {string | undefined} raw
 */
export function normalizeBase(raw) {
  const trimmed = (raw ?? '/').replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

/**
 * The web app manifest; `scope` and `start_url` are the base root, which redirects to `en/` or `de/`.
 * @param {string} base normalised base (see `normalizeBase`)
 */
export function buildManifest(base) {
  /** @param {string} file @param {number} size @param {'any' | 'maskable'} purpose */
  const icon = (file, size, purpose) => ({ src: `${base}icons/${file}`, sizes: `${size}x${size}`, type: 'image/png', purpose });
  return {
    name: 'CryVenture',
    short_name: 'CryVenture',
    description: 'Explore cryptography. Build understanding.',
    id: base,
    scope: base,
    start_url: base,
    display: 'standalone',
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    icons: [
      icon('icon-192.png', 192, 'any'),
      icon('icon-512.png', 512, 'any'),
      icon('maskable-192.png', 192, 'maskable'),
      icon('maskable-512.png', 512, 'maskable'),
    ],
  };
}

/**
 * Workbox `generateSW` options for a built `dist/` served under `base`.
 * @param {{ distDir: string, base: string }} options
 */
export function workboxOptions({ distDir, base }) {
  return {
    globDirectory: distDir,
    globPatterns: ['**/*.{html,css,js,json,svg,png,woff2,webmanifest}', 'pagefind/**/*'],
    // The worker itself and Workbox's runtime chunk must never be precached.
    globIgnores: [SW_FILENAME, 'workbox-*.js'],
    swDest: `${distDir}/${SW_FILENAME}`,
    // Precache URLs are relative to the worker, which lives at the base root.
    modifyURLPrefix: { '': base },
    navigateFallback: null,
    directoryIndex: 'index.html',
    // The HTML never depends on the query string (lab state lives in the hash), and Pagefind requests
    // `pagefind-entry.json?ts=…`; ignoring every parameter keeps both served from the precache offline.
    ignoreURLParametersMatching: [/.*/],
    maximumFileSizeToCacheInBytes: MAX_FILE_BYTES,
    skipWaiting: false,
    // The first install takes over open pages at once (offline from the first visit); updates still wait.
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    inlineWorkboxRuntime: true,
    sourcemap: false,
    mode: 'production',
  };
}

/**
 * `sw.js` for builds with `CV_PWA=false`. A browser that installed the PWA from an earlier build keeps
 * running that worker (and serving its precache) as long as a `sw.js` exists at its URL; without one
 * it may keep the stale worker indefinitely. This worker replaces it, activates at once, deletes the
 * caches of its own scope (Workbox names them after the scope; other apps on the origin keep theirs),
 * unregisters itself and reloads the pages it controlled, which then load from the network.
 * It has no fetch handler, so it never serves anything.
 */
export function selfUnregisteringWorker() {
  return `// CryVenture: the PWA is switched off (CV_PWA=false). This worker removes an earlier one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.includes(scope)).map((name) => caches.delete(name)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
    })(),
  );
});
`;
}

/** @param {number} bytes */
export function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Throws when the precache exceeds the budget.
 * @param {number} bytes
 * @param {number} [budget]
 */
export function assertPrecacheBudget(bytes, budget = PRECACHE_BUDGET_BYTES) {
  if (bytes > budget) {
    throw new Error(`Precache is ${formatMegabytes(bytes)}, above the ${formatMegabytes(budget)} budget.`);
  }
}
