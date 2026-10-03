import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { blockingViolations } from './helpers/axe.ts';

const AES_OVERVIEW = 'symmetric/aes/';

/** The first check question of the AES overview, once its island is interactive. */
async function firstQuestion(page: Page, lang: 'en' | 'de' = 'en'): Promise<Locator> {
  await page.goto(`${lang}/${AES_OVERVIEW}`);
  const question = page.locator('.cv-check').first();
  await question.scrollIntoViewIfNeeded();
  await expect(question).toHaveAttribute('data-hydrated', 'true');
  return question;
}

async function answerCorrectlyAfterOneMiss(page: Page): Promise<void> {
  const question = await firstQuestion(page);
  await question.getByRole('radio', { name: /^C/ }).check();
  await question.getByRole('button', { name: 'Check' }).click();
  await expect(question.getByRole('status')).toContainText('Not quite');
  await question.getByRole('radio', { name: /^B/ }).check();
  await question.getByRole('button', { name: 'Check' }).click();
  await expect(question.getByRole('status')).toContainText('Correct!');
  await expect(question.getByText('Answer: B')).toBeVisible();
}

const lessonRow = (page: Page, title: string) => page.locator('.cv-progress__lesson', { has: page.getByRole('link', { name: title, exact: true }) });

test('a quiz answer survives a reload and is shared between EN and DE', async ({ page }) => {
  await answerCorrectlyAfterOneMiss(page);
  await page.reload();
  const question = page.locator('.cv-check').first();
  await question.scrollIntoViewIfNeeded();
  await expect(question.getByRole('status')).toContainText('Correct!');
  await expect(question.getByRole('radio', { name: /^B/ })).toBeChecked();

  const german = await firstQuestion(page, 'de');
  await expect(german.getByRole('status')).toContainText('Richtig!');
});

for (const [lang, label] of [['en', 'Your progress'], ['de', 'Dein Fortschritt']] as const) {
  test(`the sidebar links to the ${lang} progress page`, async ({ page }) => {
    await page.goto(`${lang}/${AES_OVERVIEW}`);
    const sidebar = page.locator('#starlight__sidebar');
    const link = sidebar.getByRole('link', { name: label, exact: true });
    if (!(await link.isVisible())) await page.getByRole('button', { name: /Menu|Menü/ }).click();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/progress/$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(page.locator('#starlight__sidebar').getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  });
}

test('progress page shows scores, exports, resets and imports', async ({ page }) => {
  await answerCorrectlyAfterOneMiss(page);
  await page.goto('en/progress/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your progress');
  await expect(page.getByText('stored only in this browser')).toBeVisible();
  await expect(lessonRow(page, 'AES at a glance')).toContainText('1 of 3 answered correctly');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export progress' }).click()]);
  expect(download.suggestedFilename()).toBe('cryventure-progress.json');
  const exported = await readFile(await download.path(), 'utf8');
  expect(JSON.parse(exported)).toMatchObject({ format: 'cryventure-progress', version: 2, lessons: { 'symmetric/aes': { quiz: { 'aes192-rounds': { solved: true, lastAnswer: 1 } } } } });

  await page.getByRole('button', { name: 'Reset progress' }).click();
  await page.getByRole('button', { name: 'Yes, reset' }).click();
  await expect(page.getByText('Progress reset.')).toBeVisible();
  await expect(lessonRow(page, 'AES at a glance')).toContainText('Not started yet');

  const fileInput = page.getByLabel('Import progress');
  await fileInput.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.getByText('This file is not valid JSON.')).toBeVisible();
  await fileInput.setInputFiles({ name: 'cryventure-progress.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect(page.getByText('Progress imported.')).toBeVisible();
  await expect(lessonRow(page, 'AES at a glance')).toContainText('1 of 3 answered correctly');
});

test('progress stored by v1 (keyed by question number) moves to cv.progress.v2 by its frozen id; the v1 slot is never written', async ({ page }) => {
  const v1 = { version: 1, lens: 'cryptographer', lessons: { 'symmetric/aes': { quiz: { '1': { solved: true, lastAnswer: 1 } } } } };
  const v1Json = JSON.stringify(v1);
  await page.goto('en/progress/');
  await page.evaluate((record) => {
    localStorage.clear();
    localStorage.setItem('cv.progress.v1', record);
  }, v1Json);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-lens', 'cryptographer');
  await expect(lessonRow(page, 'AES at a glance')).toContainText('1 of 3 answered correctly');

  const question = await firstQuestion(page);
  await expect(question).toHaveAttribute('data-question-id', 'aes192-rounds');
  await expect(question.getByRole('status')).toContainText('Correct!');
  await expect(question.getByRole('radio', { name: /^B/ })).toBeChecked();

  await question.getByRole('button', { name: 'Try again' }).click();
  await question.getByRole('radio', { name: /^C/ }).check();
  await question.getByRole('button', { name: 'Check' }).click();
  await expect(question.getByRole('status')).toContainText('Not quite');
  const stored = await page.evaluate(() => ({ v1: localStorage.getItem('cv.progress.v1'), v2: JSON.parse(localStorage.getItem('cv.progress.v2') ?? 'null') }));
  expect(stored.v1).toBe(v1Json);
  expect(stored.v2).toEqual({ version: 2, lens: 'cryptographer', lessons: { 'symmetric/aes': { quiz: { 'aes192-rounds': { solved: true, lastAnswer: 2 } } } } });
});

test('an old app version writing the v1 slot in another tab cannot wipe v2 progress', async ({ page, context }) => {
  await answerCorrectlyAfterOneMiss(page);
  const oldTab = await context.newPage();
  await oldTab.goto('en/progress/');
  await oldTab.evaluate(() => localStorage.setItem('cv.progress.v1', JSON.stringify({ version: 1, lessons: {} })));
  await page.goto('en/progress/');
  await expect(lessonRow(page, 'AES at a glance')).toContainText('1 of 3 answered correctly');
});

test('German progress page is translated', async ({ page }) => {
  const response = await page.goto('de/progress/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dein Fortschritt');
  await expect(lessonRow(page, 'AES im Überblick')).toContainText('Noch nicht begonnen');
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`answered quiz and progress page have no serious or critical axe violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await answerCorrectlyAfterOneMiss(page);
    await page.locator('.cv-check').nth(1).getByRole('button', { name: 'Show answer' }).click();
    expect(await blockingViolations(page)).toEqual([]);
    await page.goto('en/progress/');
    await expect(lessonRow(page, 'AES at a glance')).toContainText('1 of 3');
    await page.getByRole('button', { name: 'Reset progress' }).click();
    expect(await blockingViolations(page)).toEqual([]);
  });
}
