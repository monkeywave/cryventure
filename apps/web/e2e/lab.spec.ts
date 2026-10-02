import { expect, test } from '@playwright/test';
import { interpolate } from '@cryventure/core';
import uiEn from '../src/i18n/en/ui.json' with { type: 'json' };
import uiDe from '../src/i18n/de/ui.json' with { type: 'json' };
import coreEn from '../../../packages/core/i18n/en.json' with { type: 'json' };
import aesEn from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import aesDe from '../../../packages/primitives/src/aes/i18n/de.json' with { type: 'json' };
import { C1, DESKTOP, LAB_ID, PHONE, expectNoHorizontalOverflow, expectStep, labButton, labLocator, openLab, seekTo, stateHex, stepCount } from './labPage.ts';

/** FIPS 197 App. B. */
const B_KEY = '2b7e151628aed2a6abf7158809cf4f3c';
const B_PLAINTEXT = '3243f6a8885a308d313198a2e0370734';
const B_CIPHERTEXT = '3925841d 02dc09fb dc118597 196a0b32';

test.describe('AES lab (EN)', () => {
  test('hydrates and the last step shows the FIPS 197 C.1 ciphertext', async ({ page }) => {
    const lab = await openLab(page);
    await expect(lab.locator('.cv-lab-poster')).toHaveCount(0);
    expect(await stepCount(lab)).toBe(C1.stepCount);
    await expectStep(lab, -1);
    await labButton(lab, 'ui.player.last').click();
    await expectStep(lab, C1.stepCount - 1);
    expect(await stateHex(lab)).toBe(C1.ciphertext);
    await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText(C1.ciphertextWords);
  });

  test('buttons and keyboard step; round 1 SubBytes matches FIPS 197 C.1', async ({ page }) => {
    const lab = await openLab(page);
    const next = labButton(lab, 'ui.player.next');
    await next.click();
    await next.click();
    await expectStep(lab, 1);
    await next.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expectStep(lab, C1.step.round1SubBytes);
    expect((await stateHex(lab)).slice(0, 2)).toBe(C1.round1SboxFirstByte);
    await page.keyboard.press('ArrowLeft');
    await expectStep(lab, C1.step.round1SubBytes - 1);
  });

  test('invalid key shows a localized error; a valid key re-runs', async ({ page }) => {
    const lab = await openLab(page);
    const key = lab.getByLabel(aesEn['plugin.aes.param.key']);
    await key.fill('zz');
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    await expect(lab.locator('.cv-params__error').first()).toHaveText(interpolate(coreEn['core.error.hexInvalidChar'], { char: 'z' }));
    await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText(C1.ciphertextWords);

    await key.fill(B_KEY);
    await lab.getByLabel(aesEn['plugin.aes.param.plaintext']).fill(B_PLAINTEXT);
    await expect(key).toHaveAttribute('aria-invalid', 'false');
    await expect(lab.getByTestId('lab-output-ciphertext')).toHaveText(B_CIPHERTEXT);
    await expect(lab.getByLabel(uiEn['ui.lab.params.preset'])).toHaveValue('fips197-b');
  });

  test('a deep link restores the step, also after reload', async ({ page }) => {
    const lab = await openLab(page, { step: 10 });
    await expectStep(lab, 10);
    await seekTo(lab, 20);
    await expect(page).toHaveURL(/#lab=aes-intro&p=[\w-]+&s=20&v=1$/);
    await page.reload();
    await expectStep(lab, 20);
  });

  test('an unreadable deep link falls back to the preset with a notice', async ({ page }) => {
    const lab = await openLab(page, { hash: `#lab=${LAB_ID}&p=%40%40&s=5&v=1` });
    await expect(lab.getByRole('status').filter({ hasText: uiEn['ui.lab.notice.invalidLink'] })).toBeVisible();
    await expectStep(lab, -1);
  });
});

test('switching to German keeps the step and shows German narration', async ({ page }) => {
  const lab = await openLab(page);
  await seekTo(lab, C1.step.round1SubBytes);
  await expect(page).toHaveURL(/s=3&v=1$/);
  await page.locator('starlight-lang-select select').first().selectOption({ label: 'Deutsch' });
  await expect(page).toHaveURL(/\/de\/foundations\/welcome-lab\/#lab=aes-intro&/);
  const labDe = labLocator(page);
  await expect(labDe.locator('section.cv-lab')).toBeVisible();
  await expectStep(labDe, C1.step.round1SubBytes, { lang: 'de' });
  await expect(labDe.locator('.cv-narration')).toHaveText(interpolate(aesDe['plugin.aes.step.subBytes'], { round: 1 }));
  await expect(labDe.getByRole('group', { name: uiDe['ui.lab.params.title'] })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\b(?:plugin|ui|view|core)\.[A-Za-z]+\.[A-Za-z]/);
});

test.describe('screenshots (dark theme)', () => {
  test.use({ colorScheme: 'dark' });

  for (const [lang, file, width] of [
    ['en', 'lab-en.png', DESKTOP.width],
    ['de', 'lab-de.png', DESKTOP.width],
    ['en', 'lab-en-mobile.png', PHONE.width],
  ] as const) {
    test(`lab ${file}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1400 });
      // First AddRoundKey of round 1 (op detail): the key-schedule words w4…w7 are current.
      const lab = await openLab(page, { lang, step: C1.step.round1AddRoundKey });
      await page.waitForTimeout(400);
      await lab.screenshot({ path: `test-results/${file}`, animations: 'disabled' });
      await expectNoHorizontalOverflow(page);
    });
  }
});
