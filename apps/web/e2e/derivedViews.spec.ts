import { expect, test, type Page } from '@playwright/test';
import type { Lens } from '@cryventure/core';
import { PHONE } from './labPage.ts';

/**
 * Derived views (instructions, registers, memory) on a phone: wide listings, byte grids and hex
 * dumps scroll inside their panel, never the page (docs/EXTENDING.md), in every lens.
 */
const PAGES = [
  { path: 'symmetric/aes/aes-ni/', views: ['.cv-instructions', '.cv-registers', '.cv-memory'] },
  { path: 'symmetric/aes/memory-abi/', views: ['.cv-memory'] },
] as const;
const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];

/** Sets the page lens the way the header selector does (on a phone it sits in the collapsed menu). */
async function setLens(page: Page, lens: Lens): Promise<void> {
  await page.evaluate((value) => {
    const select = document.querySelector<HTMLSelectElement>('cv-lens-select select');
    if (!select) throw new Error('lens selector missing');
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, lens);
  await expect(page.locator('html')).toHaveAttribute('data-lens', lens);
}

/** Labs mount when they scroll into view; bring each one in and wait until it is interactive. */
async function mountLabs(page: Page): Promise<void> {
  const labs = page.locator('[data-lab-id]');
  const count = await labs.count();
  for (let index = 0; index < count; index += 1) {
    await labs.nth(index).scrollIntoViewIfNeeded();
    await expect(labs.nth(index).locator('section.cv-lab')).toBeVisible({ timeout: 15_000 });
  }
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

test.use({ viewport: PHONE });

for (const { path, views } of PAGES) {
  for (const lens of LENSES) {
    test(`${path} never scrolls the page sideways at 390px (${lens} lens)`, async ({ page }) => {
      await page.goto(`en/${path}`);
      await setLens(page, lens);
      await mountLabs(page);
      for (const view of views) await expect(page.locator(view).first()).toBeAttached();
      expect(await pageOverflow(page)).toBe(0);
    });
  }
}
