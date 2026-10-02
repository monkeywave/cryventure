import { expect, test } from '@playwright/test';
import { blockingViolations } from './helpers/axe.ts';
import { openLab } from './labPage.ts';

for (const lang of ['en', 'de'] as const) {
  test(`home ${lang} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(`${lang}/`);
    expect(await blockingViolations(page)).toEqual([]);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`lab page ${lang} (${colorScheme}) has no serious or critical axe violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openLab(page, { lang });
      expect(await blockingViolations(page)).toEqual([]);
    });
  }
}
