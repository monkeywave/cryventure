import { expect, test } from '@playwright/test';
import en from '../src/i18n/en/ui.json' with { type: 'json' };
import de from '../src/i18n/de/ui.json' with { type: 'json' };

// Relative URLs ("en/") resolve against baseURL, so the suite also works for CV_BASE sub-path builds.

test.describe('root redirect', () => {
  test.use({ locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' } });

  test('sends English visitors to en/', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveURL(/\/en\/$/);
  });
});

test.describe('root redirect (German browser)', () => {
  test.use({ locale: 'de-DE', extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9' } });

  test('sends German visitors to de/', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveURL(/\/de\/$/);
  });
});

test('English home shows the localized hero', async ({ page }) => {
  await page.goto('en/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'CryVenture — Explore cryptography. Build understanding.',
  );
});

test('German home shows the localized hero', async ({ page }) => {
  await page.goto('de/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'CryVenture — Kryptografie entdecken. Verständnis aufbauen.',
  );
});

test('language switcher keeps the URL hash', async ({ page }) => {
  await page.goto('en/foundations/welcome-lab/#foo');
  await page.locator('starlight-lang-select select').first().selectOption({ label: 'Deutsch' });
  await expect(page).toHaveURL(/\/de\/foundations\/welcome-lab\/#foo$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AES — ein erster Blick');
});

test('unknown URL shows the bilingual 404 page', async ({ page }) => {
  const response = await page.goto('en/does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId('not-found-en').getByRole('heading')).toHaveText(en['ui.notFound.title']);
  await expect(page.getByTestId('not-found-de').getByRole('heading')).toHaveText(de['ui.notFound.title']);
});
