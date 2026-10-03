import { expect, test } from '@playwright/test';
import aesEnJson from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import cbcEnJson from '../../../packages/primitives/src/cbc/i18n/en.json' with { type: 'json' };
import ecbEnJson from '../../../packages/primitives/src/ecb/i18n/en.json' with { type: 'json' };
import xorDeJson from '../../../packages/primitives/src/xor/i18n/de.json' with { type: 'json' };
import uiEn from '../src/i18n/en/ui.json' with { type: 'json' };
import { encodeJsonBase64Url } from '../src/labs/base64url.ts';
import { expectStep, labButton, waitForLab } from './labPage.ts';

const aesEn: Record<string, string> = aesEnJson;
const xorDe: Record<string, string> = xorDeJson;
const cbcEn: Record<string, string> = cbcEnJson;
const ecbEn: Record<string, string> = ecbEnJson;

/** FIPS 197 App. B input, a non-preset key the lab must take from the link. */
const LINKED = { keyHex: '2b7e151628aed2a6abf7158809cf4f3c', plaintextHex: '3243f6a8885a308d313198a2e0370734', detail: 'op' };

test.describe('standalone lab route', () => {
  test('/en/lab/aes/ renders the AES lab with its title and steps', async ({ page }) => {
    await page.goto('en/lab/aes/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(aesEn['plugin.aes.title']!);
    const lab = await waitForLab(page, 'aes');
    await expect(lab.locator('[data-region="state"] .cv-cell').first()).toBeVisible();
    await labButton(lab, 'ui.player.next').click();
    await expectStep(lab, 0);
  });

  test('/de/lab/xor/ renders in German and steps', async ({ page }) => {
    await page.goto('de/lab/xor/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(xorDe['plugin.xor.title']!);
    const lab = await waitForLab(page, 'xor');
    await labButton(lab, 'ui.player.next', 'de').click();
    await expectStep(lab, 0, { lang: 'de' });
  });

  test('a deep link with params and a step opens with them', async ({ page }) => {
    await page.goto(`en/lab/aes/#lab=aes&p=${encodeJsonBase64Url(LINKED)}&s=4&v=1`);
    const lab = await waitForLab(page, 'aes');
    await expect(lab.getByLabel(aesEn['plugin.aes.param.key']!)).toHaveValue(LINKED.keyHex);
    await expect(lab.getByLabel(aesEn['plugin.aes.param.plaintext']!)).toHaveValue(LINKED.plaintextHex);
    await expectStep(lab, 4);
  });

  test('is neither in the sidebar nor indexed by Pagefind', async ({ page }) => {
    await page.goto('en/lab/aes/');
    await expect(page.locator('nav a[href*="/lab/"]')).toHaveCount(0);
    await expect(page.locator('[data-pagefind-body]')).toHaveCount(0);
  });

  test('/en/lab/cbc/ loads and its cipher select lists AES', async ({ page }) => {
    await page.goto('en/lab/cbc/');
    const lab = await waitForLab(page, 'cbc');
    const cipher = lab.getByLabel(cbcEn['plugin.cbc.param.cipher']!);
    await expect(cipher).toHaveValue('aes');
    await expect(cipher.getByRole('option', { name: aesEn['plugin.aes.title']! })).toHaveCount(1);
  });

  test('/en/lab/cbc/ selects the preset again once an edited key is typed back', async ({ page }) => {
    await page.goto('en/lab/cbc/');
    const lab = await waitForLab(page, 'cbc');
    const preset = lab.getByLabel(uiEn['ui.lab.params.preset']);
    const key = lab.getByLabel(cbcEn['plugin.cbc.param.key']!);
    await expect(preset).toHaveValue('repeated-blocks');
    const original = await key.inputValue();
    await key.fill('000102030405060708090a0b0c0d0e0f');
    await expect(preset).toHaveValue('');
    await key.fill(original);
    await expect(preset).toHaveValue('repeated-blocks');
  });

  test('link params that fail at run time fall back to the preset with a notice', async ({ page }) => {
    const shortKey = { cipher: 'aes', keyHex: '0001020304', inputHex: '00'.repeat(16), direction: 'encrypt', padding: 'pkcs7' };
    await page.goto(`en/lab/ecb/#lab=ecb&p=${encodeJsonBase64Url(shortKey)}&v=1`);
    const lab = await waitForLab(page, 'ecb');
    await expect(lab.getByRole('status').filter({ hasText: uiEn['ui.lab.notice.invalidLink'] })).toBeVisible();
    await expect(lab.getByLabel(uiEn['ui.lab.params.preset'])).toHaveValue('repeated-blocks');
    await expect(lab.getByLabel(ecbEn['plugin.ecb.param.key']!)).toHaveValue('2b7e151628aed2a6abf7158809cf4f3c');
    await expect(lab.locator('.cv-lab-error')).toHaveCount(0);
    // The unusable link is removed, so a reload does not repeat the fallback and the notice.
    await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('lab=ecb');
  });
});
