import { expect, test, type Locator, type Page } from '@playwright/test';
import heroEn from '../src/i18n/en/hero.json' with { type: 'json' };
import heroDe from '../src/i18n/de/hero.json' with { type: 'json' };
import { C1, DESKTOP, PHONE, expectNoHorizontalOverflow, expectStep, labButton, seekTo, waitForLab, type Lang } from './labPage.ts';

/** The home page embeds `<HeroLab />` (docs/M4.md §8): the AES lab with labId `hero` plus a text field. */
const HERO_LAB_ID = 'hero';
const HERO: Record<Lang, typeof heroEn> = { en: heroEn, de: heroDe };

/** AES-128, FIPS 197 C.1 key, "Hello" + 11 zero bytes (cross-checked with Node's crypto). */
const HELLO_CIPHERTEXT = 'd9fd218d 50a44091 43a7243d 6d913502';

async function openHero(page: Page, lang: Lang = 'en'): Promise<Locator> {
  await page.goto(`${lang}/`);
  const lab = await waitForLab(page, HERO_LAB_ID);
  await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText(C1.ciphertextWords);
  return lab;
}

const textField = (lab: Locator, lang: Lang = 'en') => lab.getByLabel(HERO[lang]['ui.hero.textLabel']);
const paddingNote = (lab: Locator) => lab.getByTestId('hero-padding-note');

test.describe('Hero lab', () => {
  test('opens in story mode on the FIPS 197 C.1 example and never autoplays', async ({ page }) => {
    const lab = await openHero(page);
    await expect(labButton(lab, 'ui.player.mode.story')).toHaveAttribute('aria-pressed', 'true');
    await expect(labButton(lab, 'ui.player.play')).toBeVisible();
    await page.waitForTimeout(1_500);
    await expectStep(lab, -1);
    await expect(paddingNote(lab)).toHaveText(heroEn['ui.hero.exampleNote']);
    await expect(lab.getByLabel(heroEn['ui.hero.keyLabel'])).toHaveValue('000102030405060708090a0b0c0d0e0f');
    await expect(lab.getByLabel(heroEn['ui.hero.keyLabel'])).toHaveAttribute('readonly', '');
  });

  test('the text field is the only input and only the layout views (state, narration) are shown', async ({ page }) => {
    const lab = await openHero(page);
    await expect(lab.locator('.cv-params__input')).toHaveCount(0);
    await expect(lab.locator('[data-region="state"] .cv-cell').first()).toBeVisible();
    await expect(lab.getByRole('tab')).toHaveCount(0);
  });

  test('typed text becomes a zero-padded block and changes the ciphertext', async ({ page }) => {
    const lab = await openHero(page);
    await textField(lab).fill('Hello');
    await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText(HELLO_CIPHERTEXT);
    await expect(paddingNote(lab)).toHaveText('+ 11 zero bytes of padding (marked) fill the block to 16 bytes.');
    await expect(lab.locator('[data-padding]')).toHaveCount(11);
    await expect(lab.getByText('5 / 16 bytes (UTF-8)')).toBeVisible();
    // Still no playback; the timeline stays scrubbable.
    await expectStep(lab, -1);
    await seekTo(lab, 3);
  });

  test('clamps the text to 16 UTF-8 bytes', async ({ page }) => {
    const lab = await openHero(page);
    await textField(lab).fill('Grüße aus Köln, Welt!');
    // "Grüße aus Köl" is 13 characters but 16 bytes (ü, ß, ö take two each); the "n" would be byte 17.
    await expect(textField(lab)).toHaveValue('Grüße aus Köl');
    await expect(paddingNote(lab)).toHaveText(heroEn['ui.hero.noPadding']);
    await expect(lab.locator('[data-padding]')).toHaveCount(0);
  });

  test('speaks German and links onward', async ({ page }) => {
    const lab = await openHero(page, 'de');
    await textField(lab, 'de').fill('Hallo');
    await expect(paddingNote(lab)).toHaveText('+ 11 Nullbytes Padding (markiert) füllen den Block auf 16 Byte auf.');
    await expect(page.getByRole('link', { name: heroDe['ui.hero.startAdventure'] })).toHaveAttribute('href', /\/de\/foundations\/prologue\/$/);
    await expect(page.getByRole('link', { name: heroDe['ui.hero.aesLesson'] })).toHaveAttribute('href', /\/de\/symmetric\/aes\/$/);
  });

  test('fits a 390 px phone without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize(PHONE);
    const lab = await openHero(page);
    await textField(lab).fill('Hi');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Hero lab screenshots', () => {
  for (const lang of ['en', 'de'] as const)
    for (const scheme of ['light', 'dark'] as const)
      for (const [size, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const)
        test(`${lang} ${scheme} ${size}`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme: scheme });
          const lab = await openHero(page, lang);
          await textField(lab, lang).fill(lang === 'en' ? 'Hello, AES!' : 'Hallo, AES!');
          await expect(paddingNote(lab)).toContainText('5');
          await expect(lab.getByTestId('lab-output-ciphertext')).not.toHaveText(C1.ciphertextWords);
          await expect(lab.locator('[data-region="state"] .cv-cell').first()).toBeVisible();
          await page.locator('.cv-hero-lab').screenshot({ path: `test-results/screens/hero-${lang}-${scheme}-${size}.png` });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `test-results/screens/home-${lang}-${scheme}-${size}.png` });
        });
});
