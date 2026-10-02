import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { LAB_PAGE, openLab } from './labPage.ts';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** Serious/critical axe violations on the current page, summarised for a readable failure. */
async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations
    .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

for (const lang of ['en', 'de'] as const) {
  test(`home ${lang} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(`${lang}/`);
    expect(await blockingViolations(page)).toEqual([]);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`lab page ${lang} (${colorScheme}) has no serious or critical axe violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openLab(page, LAB_PAGE(lang));
      expect(await blockingViolations(page)).toEqual([]);
    });
  }
}
