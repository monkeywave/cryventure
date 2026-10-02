import { expect, test, type Page } from '@playwright/test';
import prologueEn from '../src/i18n/en/prologue.json' with { type: 'json' };
import prologueDe from '../src/i18n/de/prologue.json' with { type: 'json' };
import lensEn from '../src/i18n/en/lens.json' with { type: 'json' };
import { blockingViolations } from './helpers/axe.ts';
import type { Lang } from './labPage.ts';

/** The onboarding prologue (docs/PLAN.md §4): XOR a note so Eve sees noise, then pick the default lens. */
const PROLOGUE = 'foundations/prologue/';
const MESSAGES = { en: prologueEn, de: prologueDe } as const;

async function openPrologue(page: Page, lang: Lang = 'en') {
  await page.goto(`${lang}/${PROLOGUE}`);
  const prologue = page.locator('.cv-prologue');
  await expect(prologue).toHaveAttribute('data-hydrated', 'true');
  return prologue;
}

const sceneHeading = (page: Page) => page.locator('.cv-prologue').getByRole('heading', { level: 2 });
const next = (page: Page) => page.locator('.cv-prologue').getByRole('button', { name: /Next/ });

test('walks through every scene, chooses Cryptographer and keeps it after a reload', async ({ page }) => {
  const prologue = await openPrologue(page);
  await expect(sceneHeading(page)).toHaveText(prologueEn['prologue.scene.note.title']);
  const note = prologue.getByRole('textbox', { name: prologueEn['prologue.scene.note.input'] });
  await note.fill('Hello Bob');
  await expect(prologue.locator('.cv-eve__text')).toHaveText('Hello Bob');
  await expect(prologue.locator('.cv-eve .cv-hex')).toHaveText('48 65 6c 6c 6f 20 42 6f 62');

  await next(page).click();
  await expect(sceneHeading(page)).toHaveText(prologueEn['prologue.scene.encrypt.title']);
  await expect(sceneHeading(page)).toBeFocused();
  await expect(prologue.locator('.cv-xor__tile')).toHaveCount(9);
  await expect(prologue.getByText(prologueEn['prologue.eve.noise'])).toBeAttached();
  await expect(prologue.locator('.cv-eve .cv-hex')).not.toHaveText('48 65 6c 6c 6f 20 42 6f 62');

  await next(page).click();
  await expect(sceneHeading(page)).toHaveText(prologueEn['prologue.scene.decrypt.title']);
  await expect(prologue.locator('.cv-prologue__bob-note')).toHaveText('Hello Bob');

  await next(page).click();
  await expect(sceneHeading(page)).toHaveText(prologueEn['prologue.scene.choose.title']);
  await prologue.getByRole('button', { name: /Cryptographer/ }).click();
  await expect(sceneHeading(page)).toHaveText(prologueEn['prologue.done.title']);
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'cryptographer');
  await expect(page.getByRole('combobox', { name: lensEn['lens.select.label'], exact: true })).toHaveValue('cryptographer');

  await page.reload();
  await expect(sceneHeading(page)).toHaveText(prologueEn['prologue.welcomeBack.title']);
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'cryptographer');
  await expect(prologue.getByRole('link', { name: prologueEn['prologue.next.xor'] })).toHaveAttribute('href', '../xor/');
});

test('the keyboard alone reaches the lens choice via skip', async ({ page }) => {
  await openPrologue(page);
  await page.locator('.cv-prologue').getByRole('button', { name: prologueEn['prologue.skip'] }).focus();
  await page.keyboard.press('Enter');
  await expect(sceneHeading(page)).toHaveText(prologueEn['prologue.scene.choose.title']);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'story');
});

test('the German prologue renders German text and a German default note', async ({ page }) => {
  const prologue = await openPrologue(page, 'de');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prolog: eine geheime Notiz');
  await expect(sceneHeading(page)).toHaveText(MESSAGES.de['prologue.scene.note.title']);
  await expect(prologue.getByRole('textbox')).toHaveValue(MESSAGES.de['prologue.defaultNote']);
  await expect(prologue.getByRole('button', { name: /Weiter/ })).toBeVisible();
});

test('the home page starts the adventure with the prologue', async ({ page }) => {
  await page.goto('en/');
  await page.getByRole('link', { name: 'Start the adventure' }).click();
  await expect(page).toHaveURL(/\/en\/foundations\/prologue\/$/);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the prologue has no serious axe violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await openPrologue(page);
    expect(await blockingViolations(page)).toEqual([]);
    await next(page).click();
    expect(await blockingViolations(page)).toEqual([]);
    await next(page).click();
    await next(page).click();
    expect(await blockingViolations(page)).toEqual([]);
  });
}
