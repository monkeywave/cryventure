import { expect, test, type Page } from '@playwright/test';
import type { Lens } from '@cryventure/core';
import { mountLabs, PHONE, setLens } from './labPage.ts';

/**
 * Derived views (instructions, registers, memory) on a phone: wide listings, byte grids and hex
 * dumps scroll inside their panel, never the page (docs/EXTENDING.md), in every lens. The hash
 * lessons join in: their word-operations panels (register row, terms, bit strips) scroll the same way.
 */
const PAGES = [
  { path: 'symmetric/aes/aes-ni/', views: ['.cv-instructions', '.cv-registers', '.cv-memory'] },
  { path: 'symmetric/aes/memory-abi/', views: ['.cv-memory'] },
  { path: 'hash/', views: ['.cv-lab'] },
  { path: 'hash/sha256/', views: ['.cv-wordops', '.cv-instructions', '.cv-registers'] },
  { path: 'hash/sha512/', views: ['.cv-wordops'] },
] as const;
const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];

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
