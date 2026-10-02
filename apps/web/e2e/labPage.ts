import { expect, type Locator, type Page } from '@playwright/test';

// Relative URLs resolve against baseURL, so the suites run unchanged for CV_BASE sub-path builds.
export const LAB_PAGE = (lang: 'en' | 'de') => `${lang}/foundations/welcome-lab/`;
export const LAB_ID = 'aes-intro';

/** Waits for hydration: the interactive lab region replaces the static poster and the state grid renders. */
export async function openLab(page: Page, url: string = LAB_PAGE('en')): Promise<Locator> {
  await page.goto(url);
  const lab = page.locator(`[data-lab-id="${LAB_ID}"]`);
  await lab.scrollIntoViewIfNeeded();
  await expect(lab.locator('section.cv-lab')).toBeVisible();
  // Views are code-split; wait until the state view has rendered its grid.
  await expect(lab.locator('[data-region="state"] .cv-cell').first()).toBeVisible();
  return lab;
}
