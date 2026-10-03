import { expect, test } from '@playwright/test';
import aesEnJson from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import cbcEnJson from '../../../packages/primitives/src/cbc/i18n/en.json' with { type: 'json' };
import xorDeJson from '../../../packages/primitives/src/xor/i18n/de.json' with { type: 'json' };
import { encodeJsonBase64Url } from '../src/labs/base64url.ts';
import { expectStep, labButton, waitForLab } from './labPage.ts';

const aesEn: Record<string, string> = aesEnJson;
const xorDe: Record<string, string> = xorDeJson;
const cbcEn: Record<string, string> = cbcEnJson;

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
});
