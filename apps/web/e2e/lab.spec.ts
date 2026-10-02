import { expect, test, type Locator } from '@playwright/test';
import uiEn from '../src/i18n/en/ui.json' with { type: 'json' };
import uiDe from '../src/i18n/de/ui.json' with { type: 'json' };
import coreEn from '../../../packages/core/i18n/en.json' with { type: 'json' };
import { LAB_ID, LAB_PAGE, openLab } from './labPage.ts';
import vizEn from '../../../packages/viz/src/i18n/en.json' with { type: 'json' };
import vizDe from '../../../packages/viz/src/i18n/de.json' with { type: 'json' };
import aesEn from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import aesDe from '../../../packages/primitives/src/aes/i18n/de.json' with { type: 'json' };

const LAB_PAGE_EN = LAB_PAGE('en');
const STEP_COUNT = 43;
/** FIPS 197 App. C.1 (AES-128): ciphertext, and round[1].s_box (state after round-1 SubBytes, op step 3). */
const C1_CIPHERTEXT = '69c4e0d86a7b0430d8cdb78070b4c55a';
const C1_ROUND1_SBOX_FIRST_BYTE = '63';
const ROUND1_SUBBYTES_STEP = 3;
/** FIPS 197 App. B. */
const B_KEY = '2b7e151628aed2a6abf7158809cf4f3c';
const B_PLAINTEXT = '3243f6a8885a308d313198a2e0370734';
const B_CIPHERTEXT = '3925841d 02dc09fb dc118597 196a0b32';

function stepText(template: string, step: number): string {
  return template.replace('{{current}}', String(step + 1)).replace('{{total}}', String(STEP_COUNT));
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(params[name]));
}

async function stateHex(lab: Locator): Promise<string> {
  const cells = lab.locator('[data-region="state"] .cv-cell');
  const pairs = await cells.evaluateAll((nodes) =>
    nodes.map((node) => [Number(node.getAttribute('data-index')), node.textContent?.trim().slice(0, 2) ?? ''] as const),
  );
  return pairs
    .sort(([a], [b]) => a - b)
    .map(([, hex]) => hex)
    .join('');
}

function stepOutput(lab: Locator): Locator {
  return lab.locator('.cv-timeline__step');
}

async function seekTo(lab: Locator, step: number): Promise<void> {
  await lab.getByRole('slider', { name: vizEn['ui.player.timeline'] }).fill(String(step));
}

test.describe('AES lab (EN)', () => {
  test('hydrates and the last step shows the FIPS 197 C.1 ciphertext', async ({ page }) => {
    const lab = await openLab(page);
    await expect(lab.locator('.cv-lab-poster')).toHaveCount(0);
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], -1));
    await lab.getByRole('button', { name: vizEn['ui.player.last'] }).click();
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], STEP_COUNT - 1));
    expect(await stateHex(lab)).toBe(C1_CIPHERTEXT);
    await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText('69c4e0d8 6a7b0430 d8cdb780 70b4c55a');
  });

  test('buttons and keyboard step; round 1 SubBytes matches FIPS 197 C.1', async ({ page }) => {
    const lab = await openLab(page);
    const next = lab.getByRole('button', { name: vizEn['ui.player.next'] });
    await next.click();
    await next.click();
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], 1));
    await next.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], ROUND1_SUBBYTES_STEP));
    expect((await stateHex(lab)).slice(0, 2)).toBe(C1_ROUND1_SBOX_FIRST_BYTE);
    await page.keyboard.press('ArrowLeft');
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], ROUND1_SUBBYTES_STEP - 1));
  });

  test('invalid key shows a localized error; a valid key re-runs', async ({ page }) => {
    const lab = await openLab(page);
    const key = lab.getByLabel(aesEn['plugin.aes.param.key']);
    await key.fill('zz');
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    await expect(lab.locator('.cv-params__error').first()).toHaveText(interpolate(coreEn['core.error.hexInvalidChar'], { char: 'z' }));
    await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText('69c4e0d8 6a7b0430 d8cdb780 70b4c55a');

    await key.fill(B_KEY);
    await lab.getByLabel(aesEn['plugin.aes.param.plaintext']).fill(B_PLAINTEXT);
    await expect(key).toHaveAttribute('aria-invalid', 'false');
    await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText(B_CIPHERTEXT);
    await expect(lab.getByLabel(uiEn['ui.lab.params.preset'])).toHaveValue('fips197-b');
  });

  test('a deep link restores the step, also after reload', async ({ page }) => {
    const lab = await openLab(page, `${LAB_PAGE_EN}#lab=${LAB_ID}&s=10&v=1`);
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], 10));
    await seekTo(lab, 20);
    await expect(page).toHaveURL(/#lab=aes-intro&p=[\w-]+&s=20&v=1$/);
    await page.reload();
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], 20));
  });

  test('an unreadable deep link falls back to the preset with a notice', async ({ page }) => {
    const lab = await openLab(page, `${LAB_PAGE_EN}#lab=${LAB_ID}&p=%40%40&s=5&v=1`);
    await expect(lab.getByRole('status').filter({ hasText: uiEn['ui.lab.notice.invalidLink'] })).toBeVisible();
    await expect(stepOutput(lab)).toHaveText(stepText(vizEn['ui.player.stepOf'], -1));
  });
});

test('switching to German keeps the step and shows German narration', async ({ page }) => {
  const lab = await openLab(page);
  await seekTo(lab, ROUND1_SUBBYTES_STEP);
  await expect(page).toHaveURL(/s=3&v=1$/);
  await page.locator('starlight-lang-select select').first().selectOption({ label: 'Deutsch' });
  await expect(page).toHaveURL(/\/de\/foundations\/welcome-lab\/#lab=aes-intro&/);
  const labDe = page.locator(`[data-lab-id="${LAB_ID}"]`);
  await expect(labDe.locator('section.cv-lab')).toBeVisible();
  await expect(stepOutput(labDe)).toHaveText(stepText(vizDe['ui.player.stepOf'], ROUND1_SUBBYTES_STEP));
  await expect(labDe.locator('.cv-narration')).toHaveText(interpolate(aesDe['plugin.aes.step.subBytes'], { round: 1 }));
  await expect(labDe.getByRole('group', { name: uiDe['ui.lab.params.title'] })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\b(?:plugin|ui|view|core)\.[A-Za-z]+\.[A-Za-z]/);
});

/** First AddRoundKey of round 1 (op detail): the key-schedule words w4…w7 are current. */
const ROUND1_ADD_ROUND_KEY_STEP = 6;

test.describe('screenshots (dark theme)', () => {
  test.use({ colorScheme: 'dark' });

  for (const [lang, file, width] of [
    ['en', 'lab-en.png', 1280],
    ['de', 'lab-de.png', 1280],
    ['en', 'lab-en-mobile.png', 390],
  ] as const) {
    test(`lab ${file}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1400 });
      const lab = await openLab(page, `${LAB_PAGE(lang)}#lab=${LAB_ID}&s=${ROUND1_ADD_ROUND_KEY_STEP}&v=1`);
      await page.waitForTimeout(400);
      await lab.screenshot({ path: `test-results/${file}`, animations: 'disabled' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
