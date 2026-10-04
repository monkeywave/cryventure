import { expect, test } from '@playwright/test';
import type { Lens } from '@cryventure/core';
import { blockingViolations } from './helpers/axe.ts';
import { LANGS, recordPageErrors } from './hashLessons.ts';
import { DESKTOP, PHONE, mountLabs, setLens, waitForLab, type Lang } from './labPage.ts';
import { HASH_GROUP_LABEL, M7_LESSONS, M7_SIDEBAR, pageOverflow, recordCspViolations, screenshotStem, waitForLabMounted } from './macKdfLessons.ts';

// The M7 MAC and KDF lessons (docs/M7.md §7, §8): load, labs mount without console errors or CSP
// violations, sidebar order, axe in all three lenses, phones without page scroll, and the named
// visual-gate screenshots of each lesson's first lab.

const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];
const SIX_PARTS: Record<Lang, RegExp> = { en: /^Part 6 · Check$/, de: /^Teil 6 · Selbsttest$/ };

for (const lang of LANGS) {
  for (const lesson of M7_LESSONS) {
    test(`${lang}/${lesson.slug} renders six parts and mounts every lab without console errors or CSP violations`, async ({ page }) => {
      test.slow(); // every lab of the page is brought into view and rendered
      const csp = await recordCspViolations(page);
      const errors = recordPageErrors(page);
      const response = await page.goto(`${lang}/${lesson.slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.titles[lang]);
      await expect(page.locator('.cv-lesson-section')).toHaveCount(6);
      await expect(page.locator('.cv-lesson-section__eyebrow').last()).toHaveText(SIX_PARTS[lang]);
      await expect(page.locator('.cv-check')).toHaveCount(3);
      await expect(page.locator('[data-lab-id]')).toHaveCount(lesson.labIds.length);
      await mountLabs(page);
      for (const labId of lesson.labIds) await waitForLab(page, labId);
      await expect(page.locator('.cv-lab-error')).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(csp).toEqual([]);
    });
  }

  test(`the MACs and Key derivation sidebar groups follow Hash functions in M7 order (${lang.toUpperCase()})`, async ({ page }) => {
    await page.goto(`${lang}/mac/`);
    const sidebar = page.locator('#starlight__sidebar');
    const topLabels = await sidebar
      .locator('ul.top-level > li > details > summary')
      .evaluateAll((summaries) => summaries.map((summary) => summary.textContent?.trim() ?? ''));
    const hashIndex = topLabels.indexOf(HASH_GROUP_LABEL[lang]);
    expect(hashIndex, topLabels.join(' | ')).toBeGreaterThanOrEqual(0);
    expect(topLabels.slice(hashIndex + 1, hashIndex + 3)).toEqual(M7_SIDEBAR.map((group) => group.label[lang]));
    for (const group of M7_SIDEBAR) {
      const details = sidebar.locator('details').filter({ has: page.locator('summary').getByText(group.label[lang], { exact: true }) });
      await expect(details).toHaveCount(1);
      const paths = await details.getByRole('link').evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
      expect(paths.map((path) => path.replace(new RegExp(`^.*?/${lang}/`), ''))).toEqual([...group.slugs]);
    }
  });
}

/** Axe on every new page in all three lenses (EN, light), plus one DE dark run per page. */
const AXE_RUNS: readonly { lang: Lang; slug: string; lens: Lens; colorScheme: 'light' | 'dark' }[] = M7_LESSONS.flatMap(({ slug }) => [
  ...LENSES.map((lens) => ({ lang: 'en' as const, slug, lens, colorScheme: 'light' as const })),
  { lang: 'de' as const, slug, lens: 'cryptographer' as const, colorScheme: 'dark' as const },
]);

for (const { lang, slug, lens, colorScheme } of AXE_RUNS) {
  test(`${lang}/${slug} has no serious or critical axe violations (${lens} lens, ${colorScheme})`, async ({ page }) => {
    test.slow(); // every lab mounted (sponge grids, derivation chains) and axe's color-contrast pass over all of it
    await page.emulateMedia({ colorScheme });
    await page.goto(`${lang}/${slug}`);
    await setLens(page, lens);
    await mountLabs(page);
    expect(await blockingViolations(page)).toEqual([]);
  });
}

test.describe('M7 lessons at 390px', () => {
  test.use({ viewport: PHONE });
  // EN in every lens; DE (longer words) in the cryptographer lens, the one with the most text.
  const runs = M7_LESSONS.flatMap(({ slug }) => [
    ...LENSES.map((lens) => ({ lang: 'en' as Lang, slug, lens })),
    { lang: 'de' as Lang, slug, lens: 'cryptographer' as Lens },
  ]);
  for (const { lang, slug, lens } of runs) {
    test(`${lang}/${slug} never scrolls the page sideways (${lens} lens)`, async ({ page }) => {
      test.slow();
      await page.goto(`${lang}/${slug}`);
      await setLens(page, lens);
      await mountLabs(page);
      expect(await pageOverflow(page)).toBe(0);
    });
  }
});

/**
 * Named screenshots for the visual gate (not pixel baselines): the first lab of each lesson, per
 * language, colour scheme, size and lens, as test-results/screens/<area>-<lesson>-<lang>-<scheme>-<size>-<lens>.png
 * (e.g. mac-hmac-de-dark-phone-story.png), the M6 naming scheme.
 */
test.describe('M7 lesson screenshots', () => {
  for (const lesson of M7_LESSONS)
    for (const lang of LANGS)
      for (const scheme of ['light', 'dark'] as const)
        for (const [size, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const)
          test(`${lesson.slug} ${lang} ${scheme} ${size}`, async ({ page }) => {
            test.slow(); // three lenses per test
            await page.setViewportSize(viewport);
            await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
            await page.goto(`${lang}/${lesson.slug}`);
            const lab = await waitForLabMounted(page, lesson.labIds[0]!);
            for (const lens of LENSES) {
              await setLens(page, lens);
              await expect(lab).toHaveAttribute('data-lens', lens);
              await expect(lab.locator('.cv-view__status[data-status="loading"]')).toHaveCount(0);
              await lab.screenshot({ path: `test-results/screens/${screenshotStem(lesson.slug)}-${lang}-${scheme}-${size}-${lens}.png`, animations: 'disabled' });
            }
          });
});
