import { defineConfig, devices } from '@playwright/test';

/**
 * Set E2E_BASE_URL to test an already running server (e.g. Docker).
 * `CV_BASE=/cryventure/ pnpm e2e` (= `pnpm e2e:subpath`) builds and tests the GitHub Pages sub-path variant.
 */
const base = process.env.CV_BASE ?? '/';
/**
 * Own port for the preview server Playwright starts: 4321 is `astro dev`'s default, and with
 * `reuseExistingServer` a running dev server there would be tested instead of the production build.
 */
const PREVIEW_PORT = 4329;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PREVIEW_PORT}${base}`;
const useExternalServer = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  // Only specs: e2e/helpers/*.test.ts are vitest unit tests.
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: useExternalServer
    ? undefined
    : {
        // --ignore-lock keeps preview in the foreground: Astro 7 auto-backgrounds it when an AI agent is detected.
        command: `pnpm build && pnpm preview --port ${PREVIEW_PORT} --ignore-lock`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
