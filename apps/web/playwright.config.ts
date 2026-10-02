import { defineConfig, devices } from '@playwright/test';

/**
 * Set E2E_BASE_URL to test an already running server (e.g. Docker).
 * `CV_BASE=/cryventure/ pnpm e2e` (= `pnpm e2e:subpath`) builds and tests the GitHub Pages sub-path variant.
 */
const base = process.env.CV_BASE ?? '/';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:4321${base}`;
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
        command: 'pnpm build && pnpm preview --port 4321 --ignore-lock',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
