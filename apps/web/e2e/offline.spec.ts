import { expect, test, type Page } from '@playwright/test';
import { expectStep, labButton, openLab } from './labPage.ts';

// docs/M3.md §11: once the service worker controls the page, lessons, labs and search work offline.
// Relative URLs resolve against baseURL, so this runs unchanged for CV_BASE sub-path builds.

const pwaDisabled = process.env.CV_PWA === 'false';

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'offline emulation of service workers is Chromium-only here',
);

const OFFLINE_PAGES = [
  'en/foundations/xor/',
  'en/symmetric/aes/key-expansion/',
  'en/',
  'de/foundations/gf256/',
];

/** Waits for an active worker (precache complete) and for it to control the page. */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.goto('en/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const controlled = () => page.evaluate(() => navigator.serviceWorker.controller !== null);
  if (!(await controlled())) await page.reload();
  expect(await controlled()).toBe(true);
}

/** Goes to `path` and checks the response came from the service worker and the page rendered. */
async function expectOfflinePage(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.fromServiceWorker(), `${path} served by the service worker`).toBe(true);
  await expect(page.locator('h1').first()).toBeVisible();
}

test.describe('offline (PWA)', () => {
  test.skip(pwaDisabled, 'PWA disabled (CV_PWA=false)');

  test.beforeEach(async ({ page, context }) => {
    await waitForServiceWorkerControl(page);
    await context.setOffline(true);
  });

  test('lessons and the home page render offline', async ({ page }) => {
    for (const path of OFFLINE_PAGES) await expectOfflinePage(page, path);
  });

  test('a lab loads and steps offline', async ({ page }) => {
    const lab = await openLab(page);
    const next = labButton(lab, 'ui.player.next');
    await next.click();
    await next.click();
    await expectStep(lab, 1);
  });

  test('Pagefind search runs from the precache', async ({ page, baseURL }) => {
    const entry = new URL(`pagefind/pagefind-entry.json?ts=${Date.now()}`, baseURL).href;
    expect(await page.evaluate(async (url) => (await fetch(url)).status, entry)).toBe(200);

    await page.locator('site-search button[data-open-modal]').click();
    await page.locator('.pagefind-ui__search-input').fill('XOR');
    await expect(page.locator('.pagefind-ui__result-link').first()).toBeVisible();
  });
});

test.describe('PWA switched off (CV_PWA=false)', () => {
  test.skip(!pwaDisabled, 'only for builds with CV_PWA=false');

  const registrationCount = (page: Page) =>
    page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length).catch(() => -1);

  test('links no manifest, and its sw.js removes a worker installed earlier', async ({ page, baseURL }) => {
    await page.goto('en/');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    // Stand-in for the worker of an earlier PWA build: the browser fetches this build's sw.js at the same URL.
    const workerUrl = new URL('sw.js', baseURL).href;
    await page.evaluate(async (url) => void (await navigator.serviceWorker.register(url)), workerUrl);
    await expect.poll(() => registrationCount(page)).toBe(0);
  });
});
