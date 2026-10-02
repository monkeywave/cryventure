import { expect, test, type Locator, type Page } from '@playwright/test';
import viewsEn from '../../../packages/views/src/key-schedule/i18n/en.json' with { type: 'json' };
import viewsDe from '../../../packages/views/src/key-schedule/i18n/de.json' with { type: 'json' };
import aesEn from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import aesDe from '../../../packages/primitives/src/aes/i18n/de.json' with { type: 'json' };
import { blockingViolations } from './helpers/axe.ts';

// Relative URLs resolve against baseURL, so the suite also runs for CV_BASE sub-path builds.

type Lang = 'en' | 'de';

const LAB_ID = 'aes-key-schedule';
const PAGE = (lang: Lang) => `${lang}/symmetric/aes/key-expansion/`;
const MESSAGES = { en: { view: viewsEn, aes: aesEn }, de: { view: viewsDe, aes: aesDe } } as const;
/** FIPS 197 App. A.1: w[4] (round key 1) and w[40] (round key 10). */
const W4 = 'a0fafe17';
const W40 = 'd014f9a8';
const W4_CHAIN = ['cf4f3c09', '8a84eb01', '01000000', '8b84eb01', '2b7e1516', W4];

const MOBILE = { width: 390, height: 844 };

/** "How Word w[i] is derived" / "So entsteht Wort w[i]" from the shipped catalogs. */
function chainTitle(lang: Lang, i: number): string {
  const { view, aes } = MESSAGES[lang];
  const name = aes['plugin.aes.derivation.word'].replace('{{i}}', String(i));
  return view['view.key-schedule.chainTitle'].replace('{{name}}', name);
}

async function openKeySchedule(page: Page, lang: Lang): Promise<Locator> {
  await page.goto(PAGE(lang));
  const lab = page.locator(`[data-lab-id="${LAB_ID}"]`);
  await lab.scrollIntoViewIfNeeded();
  const schedule = lab.locator('section.cv-keyschedule');
  await expect(schedule.locator('.cv-keyschedule__word')).toHaveCount(44);
  return schedule;
}

const word = (schedule: Locator, hex: string) =>
  schedule.getByRole('button', { name: new RegExp(`${hex}$`) });
const rowOf = (chain: Locator) =>
  chain.locator('xpath=ancestor::li[contains(@class, "cv-keyschedule__row")][1]');

/** Round index of the row that contains `chain`, and whether the next row follows it directly. */
async function hostRow(chain: Locator): Promise<{ index: number; nextIsRow: boolean }> {
  return rowOf(chain).evaluate((row) => ({
    index: [...row.parentElement!.children].indexOf(row),
    nextIsRow:
      row.nextElementSibling === null ||
      row.nextElementSibling.classList.contains('cv-keyschedule__row'),
  }));
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every chain line keeps its hex on one line, inside the panel. */
async function expectHexFits(chain: Locator): Promise<void> {
  const fits = await chain.locator('.cv-keyschedule__link').evaluateAll((lines) =>
    lines.every((line) => {
      const hex = line.querySelector('.cv-keyschedule__hex')!.getBoundingClientRect();
      const box = line.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(line).lineHeight) || 20;
      return hex.right <= box.right + 0.5 && hex.height < lineHeight * 1.5;
    }),
  );
  expect(fits).toBe(true);
}

for (const lang of ['en', 'de'] as const) {
  for (const [device, viewport] of [
    ['desktop', { width: 1280, height: 900 }],
    ['mobile', MOBILE],
  ] as const) {
    test(`${lang} ${device}: the chain opens inline beneath its round key`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const schedule = await openKeySchedule(page, lang);
      await word(schedule, W4).click();
      const chain = schedule.getByRole('region', { name: chainTitle(lang, 4) });
      await expect(chain).toBeInViewport();
      for (const hex of W4_CHAIN) await expect(chain).toContainText(hex);
      expect(await hostRow(chain)).toEqual({ index: 1, nextIsRow: true });
      await expect(word(schedule, W4)).toHaveAttribute('aria-expanded', 'true');
      await expect(word(schedule, W4)).toBeFocused();
      await expectHexFits(chain);

      await word(schedule, W40).click();
      const last = schedule.getByRole('region', { name: chainTitle(lang, 40) });
      await expect(last).toBeInViewport();
      expect((await hostRow(last)).index).toBe(10);
      await expect(schedule.locator('.cv-keyschedule__chain')).toHaveCount(1);

      await page.keyboard.press('Escape');
      await expect(schedule.locator('.cv-keyschedule__chain')).toHaveCount(0);
      await noHorizontalOverflow(page);
    });
  }
}

test('hover marks the source words and never opens a chain', async ({ page }) => {
  const schedule = await openKeySchedule(page, 'en');
  const before = await schedule.boundingBox();
  await word(schedule, W4).hover();
  await expect(schedule.locator('[data-source]')).toHaveCount(2);
  await expect(word(schedule, '09cf4f3c')).toHaveAttribute('data-source', '');
  await expect(word(schedule, '2b7e1516')).toHaveAttribute('data-source', '');
  await expect(schedule.locator('.cv-keyschedule__chain')).toHaveCount(0);
  expect((await schedule.boundingBox())?.height).toBe(before?.height);
});

test('an open chain has no serious or critical axe violations (EN, dark)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const schedule = await openKeySchedule(page, 'en');
  await word(schedule, W4).click();
  await expect(schedule.locator('.cv-keyschedule__chain')).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
});

test('an open chain has no serious or critical axe violations on the whole page (DE, light, mobile)', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.emulateMedia({ colorScheme: 'light' });
  const schedule = await openKeySchedule(page, 'de');
  await word(schedule, W4).click();
  await expect(schedule.locator('.cv-keyschedule__chain')).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
});

test.describe('screenshots', () => {
  for (const [lang, scheme, viewport, file] of [
    ['en', 'dark', { width: 1280, height: 900 }, 'keyschedule-desktop-dark-en.png'],
    ['de', 'light', MOBILE, 'keyschedule-mobile-light-de.png'],
  ] as const) {
    test(file, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const schedule = await openKeySchedule(page, lang);
      await word(schedule, W4).click();
      await word(schedule, W4).hover();
      await expect(schedule.locator('.cv-keyschedule__chain')).toBeInViewport();
      await schedule.screenshot({ path: `test-results/${file}`, animations: 'disabled' });
    });
  }
});
