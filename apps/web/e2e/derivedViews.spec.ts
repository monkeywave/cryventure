import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Lens } from '@cryventure/core';
import { DESKTOP, mountLabs, PHONE, setLens, waitForLab } from './labPage.ts';

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

/** SHA-2 round labs: every register word fits its cell (64-bit words wrap onto two lines), on a phone and a desktop. */
const ROUND_LABS = [
  { path: 'hash/sha256/', labId: 'sha256-abc', lines: 1 },
  { path: 'hash/sha512/', labId: 'sha512-abc', lines: 2 },
] as const;

/** Distinct line tops of each register word's chunks (32-bit: one line; 64-bit: two lines of two chunks). */
const wordLineCounts = (cells: Locator) =>
  cells.evaluateAll((nodes) =>
    nodes.map((node) => new Set([...node.querySelectorAll('.cv-wordops__chunk')].map((chunk) => Math.round(chunk.getBoundingClientRect().top))).size),
  );

for (const viewport of [PHONE, DESKTOP]) {
  test.describe(`register cells at ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const { path, labId, lines } of ROUND_LABS) {
      test(`${labId}: no register word overflows its cell, each word on ${lines} line(s)`, async ({ page }) => {
        await page.goto(`en/${path}`);
        const lab = await waitForLab(page, labId);
        const cells = lab.locator('.cv-wordops__reg');
        await expect(cells.first()).toBeVisible();
        const overflowing = await cells.evaluateAll((nodes) =>
          nodes.filter((node) => node.scrollWidth > node.clientWidth).map((node) => node.getAttribute('data-register')),
        );
        expect(overflowing).toEqual([]);
        expect(new Set(await wordLineCounts(cells))).toEqual(new Set([lines]));
      });
    }
  });
}
