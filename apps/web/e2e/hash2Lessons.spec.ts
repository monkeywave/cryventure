import { expect, test } from '@playwright/test';
import type { Lens } from '@cryventure/core';
import { blockingViolations } from './helpers/axe.ts';
import { HASH_SIDEBAR_ORDER, LANGS, M6_HASH_LESSONS, recordPageErrors } from './hashLessons.ts';
import { DESKTOP, PHONE, mountLabs, setLens, waitForLab, type Lang } from './labPage.ts';

// The M6 hash lessons (docs/M6.md §7, §8): load, labs mount without console errors, the lessons
// list and sidebar order, axe in all three lenses, and the named visual-gate screenshots.

const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];
const SIX_PARTS: Record<Lang, RegExp> = { en: /^Part 6 · Check$/, de: /^Teil 6 · Selbsttest$/ };
const HASH_GROUP: Record<Lang, string> = { en: 'Hash functions', de: 'Hashfunktionen' };

for (const lang of LANGS) {
  for (const lesson of M6_HASH_LESSONS) {
    test(`${lang}/${lesson.slug} renders six parts and mounts every lab without console errors`, async ({ page }) => {
      test.slow(); // every lab of the page is brought into view and rendered
      const errors = recordPageErrors(page);
      const response = await page.goto(`${lang}/${lesson.slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      const heading = page.getByRole('heading', { level: 1 });
      if (lang === 'en') await expect(heading).toHaveText(lesson.titleEn);
      else await expect(heading, 'DE page is a translation, not the EN fallback').not.toHaveText(lesson.titleEn);
      await expect(page.locator('.cv-lesson-section')).toHaveCount(6);
      await expect(page.locator('.cv-lesson-section__eyebrow').last()).toHaveText(SIX_PARTS[lang]);
      await expect(page.locator('.cv-check')).toHaveCount(3);
      await mountLabs(page);
      for (const labId of lesson.labIds) await waitForLab(page, labId);
      expect(errors).toEqual([]);
    });
  }

  test(`the Hash functions sidebar lists the lessons in M6 order (${lang.toUpperCase()})`, async ({ page }) => {
    await page.goto(`${lang}/hash/`);
    const sidebar = page.locator('#starlight__sidebar');
    const group = sidebar.locator('details').filter({ has: page.locator('summary').getByText(HASH_GROUP[lang], { exact: true }) });
    await expect(group).toHaveCount(1);
    const paths = await group.getByRole('link').evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
    expect(paths.map((path) => path.replace(new RegExp(`^.*?/${lang}/`), ''))).toEqual([...HASH_SIDEBAR_ORDER]);
  });
}

test('sidebar walks from SHA-512 through the M6 hash lessons in order (EN)', async ({ page }) => {
  await page.goto('en/hash/sha512/');
  const sidebar = page.locator('#starlight__sidebar');
  for (const lesson of M6_HASH_LESSONS) {
    await sidebar.getByRole('link', { name: lesson.titleEn, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${lesson.slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.titleEn);
  }
});

test('the "Next" pagination of each M6 hash lesson follows the sidebar order (EN)', async ({ page }) => {
  for (const [index, slug] of HASH_SIDEBAR_ORDER.slice(0, -1).entries()) {
    await page.goto(`en/${slug}`);
    const next = await page.locator('.pagination-links a[rel="next"]').getAttribute('href');
    expect(new URL(next!, page.url()).pathname).toMatch(new RegExp(`/en/${HASH_SIDEBAR_ORDER[index + 1]}$`));
  }
});

/** Axe on every new page in all three lenses (EN, light), plus one DE dark run per page. */
const AXE_RUNS: readonly { lang: Lang; slug: string; lens: Lens; colorScheme: 'light' | 'dark' }[] = M6_HASH_LESSONS.flatMap(({ slug }) => [
  ...LENSES.map((lens) => ({ lang: 'en' as const, slug, lens, colorScheme: 'light' as const })),
  { lang: 'de' as const, slug, lens: 'cryptographer' as const, colorScheme: 'dark' as const },
]);

for (const { lang, slug, lens, colorScheme } of AXE_RUNS) {
  test(`${lang}/${slug} has no serious or critical axe violations (${lens} lens, ${colorScheme})`, async ({ page }) => {
    // Genuinely slow, not a hang: every lab mounted (25-lane sponge grids, 16-word BLAKE2 matrices,
    // 500-instruction listings) and axe's color-contrast pass over all of it.
    test.slow();
    await page.emulateMedia({ colorScheme });
    await page.goto(`${lang}/${slug}`);
    await setLens(page, lens);
    await mountLabs(page);
    expect(await blockingViolations(page)).toEqual([]);
  });
}

/**
 * Named screenshots for the visual gate (not pixel baselines): the first lab of each lesson, per
 * language, colour scheme, size and lens, as test-results/screens/<lesson>-<lang>-<scheme>-<size>-<lens>.png.
 */
test.describe('M6 hash lesson screenshots', () => {
  for (const lesson of M6_HASH_LESSONS)
    for (const lang of LANGS)
      for (const scheme of ['light', 'dark'] as const)
        for (const [size, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const)
          test(`${lesson.slug} ${lang} ${scheme} ${size}`, async ({ page }) => {
            test.slow(); // three lenses per test
            const name = lesson.slug.replace(/^hash\/|\/$/g, '');
            await page.setViewportSize(viewport);
            await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
            await page.goto(`${lang}/${lesson.slug}`);
            const lab = await waitForLab(page, lesson.labIds[0]!);
            for (const lens of LENSES) {
              await setLens(page, lens);
              await expect(lab).toHaveAttribute('data-lens', lens);
              await expect(lab.locator('.cv-view__status[data-status="loading"]')).toHaveCount(0);
              await lab.screenshot({ path: `test-results/screens/hash-${name}-${lang}-${scheme}-${size}-${lens}.png`, animations: 'disabled' });
            }
          });
});
