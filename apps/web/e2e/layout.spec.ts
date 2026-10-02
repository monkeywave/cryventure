import { expect, test } from '@playwright/test';
import { KEY_SCHEDULE_LAB, PHONE, openLab } from './labPage.ts';

/** The lab host's own bottom margin (1.5rem) plus the footer's top margin (1.5rem), with some slack. */
const MAX_GAP_BELOW_LAB = 64;

test.describe('phone layout', () => {
  test.use({ viewport: PHONE });

  test('no blank gap between a closing lab and the page pagination', async ({ page }) => {
    const lab = await openLab(page);
    const labBottom = await lab.evaluate((element) => element.getBoundingClientRect().bottom + window.scrollY);
    const pagination = page.locator('.pagination-links');
    const paginationTop = await pagination.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    expect(paginationTop - labBottom).toBeLessThanOrEqual(MAX_GAP_BELOW_LAB);
  });

  test('scrollable formulas are keyboard-focusable regions named by their caption', async ({ page }) => {
    await page.goto(`de/${KEY_SCHEDULE_LAB.path}`);
    const bodies = page.locator('.cv-formula__body');
    expect(await bodies.count()).toBeGreaterThan(0);
    for (const body of await bodies.all()) {
      await expect(body).toHaveAttribute('tabindex', '0');
      const captionId = await body.getAttribute('aria-labelledby');
      if (captionId === null) continue;
      await expect(body).toHaveAttribute('role', 'region');
      await expect(page.locator(`[id="${captionId}"]`)).toHaveText(/\S/);
    }
    await bodies.first().focus();
    await expect(bodies.first()).toBeFocused();
  });
});
