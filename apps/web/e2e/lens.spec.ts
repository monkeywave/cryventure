import { expect, test, type Page } from '@playwright/test';
import lensEn from '../src/i18n/en/lens.json' with { type: 'json' };
import lensDe from '../src/i18n/de/lens.json' with { type: 'json' };
import { blockingViolations } from './helpers/axe.ts';
import { PHONE, waitForLab, type Lang } from './labPage.ts';

/** The page-wide lens (docs/M2.md §6): header selector → `<html data-lens>` → `<Lens>` blocks and labs. */
const LENS = { en: lensEn, de: lensDe } as const;
const SBOX_PAGE = 'symmetric/aes/subbytes-sbox/';
const SBOX_LAB = 'aes-subbytes';

const lensSelect = (page: Page, lang: Lang = 'en') => page.getByRole('combobox', { name: LENS[lang]['lens.select.label'], exact: true });
const cryptographerBlock = (page: Page) => page.locator('.cv-lens[data-lens-for="cryptographer"]');

test('switching the lens shows and hides a cryptographer block', async ({ page }) => {
  await page.goto(`en/${SBOX_PAGE}`);
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'engineer');
  await expect(lensSelect(page)).toHaveValue('engineer');
  await expect(cryptographerBlock(page)).toBeHidden();

  await lensSelect(page).selectOption('cryptographer');
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'cryptographer');
  await expect(cryptographerBlock(page)).toBeVisible();
  await expect(cryptographerBlock(page)).toContainText(lensEn['lens.badge.cryptographer']);

  await lensSelect(page).selectOption('story');
  await expect(cryptographerBlock(page)).toBeHidden();
});

test('the lens persists across reload and an EN to DE switch', async ({ page }) => {
  await page.goto(`en/${SBOX_PAGE}`);
  await lensSelect(page).selectOption('cryptographer');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'cryptographer');
  await expect(lensSelect(page)).toHaveValue('cryptographer');

  await page.locator('starlight-lang-select select').first().selectOption({ label: 'Deutsch' });
  await expect(page).toHaveURL(/\/de\//);
  await expect(lensSelect(page, 'de')).toHaveValue('cryptographer');
  await expect(cryptographerBlock(page)).toBeVisible();
  await expect(cryptographerBlock(page)).toContainText(lensDe['lens.badge.cryptographer']);
});

test('a lab without a pinned lens follows the page lens live', async ({ page }) => {
  await page.goto(`en/${SBOX_PAGE}`);
  const lab = await waitForLab(page, SBOX_LAB);
  await expect(lab).toHaveAttribute('data-lens', 'engineer');
  await lensSelect(page).selectOption('story');
  await expect(lab).toHaveAttribute('data-lens', 'story');
});

test('after a reload, a lab starts from the stored page lens and the early lens script ships once', async ({ page }) => {
  await page.goto(`en/${SBOX_PAGE}`);
  await lensSelect(page).selectOption('story');
  await page.reload();
  const lab = await waitForLab(page, SBOX_LAB);
  await expect(lab).toHaveAttribute('data-lens', 'story');
  await expect(page.locator('script[data-storage-key]')).toHaveCount(1);
  await expect(page.locator('head script[data-storage-key]')).toHaveCount(1);
});

test('the lens selector is in the mobile menu', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(`en/${SBOX_PAGE}`);
  await page.getByRole('button', { name: 'Menu' }).click();
  await lensSelect(page).selectOption('cryptographer');
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'cryptographer');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`lens selector and a lens block have no serious axe violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`en/${SBOX_PAGE}`);
    await lensSelect(page).selectOption('cryptographer');
    await expect(cryptographerBlock(page)).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });
}
