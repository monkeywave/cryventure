import { expect, test } from '@playwright/test';
import { interpolate } from '@cryventure/core';
import endianEn from '../../../packages/primitives/src/endian/i18n/en.json' with { type: 'json' };
import gf256En from '../../../packages/primitives/src/gf256/i18n/en.json' with { type: 'json' };
import xorEn from '../../../packages/primitives/src/xor/i18n/en.json' with { type: 'json' };
import xorDe from '../../../packages/primitives/src/xor/i18n/de.json' with { type: 'json' };
import { seekTo, VIZ, waitForLab, type Lang } from './labPage';

// Generic (non-AES) labs: no invented "Round n", placeholders for unwritten bytes, sensible addresses.

const XOR = { path: 'foundations/xor/', labId: 'xor-otp' } as const;
const ENDIAN = { path: 'foundations/endianness/', labId: 'endian-byte-order' } as const;
const GF256 = { path: 'foundations/gf256/', labId: 'gf256-calc' } as const;
const XOR_I18N = { en: xorEn, de: xorDe } as const;

for (const lang of ['en', 'de'] as const satisfies readonly Lang[]) {
  test(`xor lab (${lang}): message and key are the narrated initial state, no round label, unwritten bytes are placeholders`, async ({ page }) => {
    await page.goto(`${lang}/${XOR.path}`);
    const lab = await waitForLab(page, XOR.labId);
    await expect(lab.locator('.cv-narration')).toHaveText(interpolate(XOR_I18N[lang]['plugin.xor.step.initial'], { count: 5 }));
    await expect(lab.locator('[data-region="message"] .cv-cell').first()).toHaveText('68');
    await expect(lab.locator('[data-region="key"] .cv-cell').first()).toHaveText('2b');
    const result = lab.locator('[data-region="result"] .cv-cell');
    await expect(result.first()).toHaveText('··');
    await expect(result.first()).toHaveAttribute('aria-label', new RegExp(`${VIZ[lang]['ui.grid.unwritten']}$`));
    await seekTo(lab, 0, lang);
    await expect(lab.locator('.cv-timeline__scope')).toHaveCount(0);
    await expect(lab.locator('.cv-narration__scope')).toHaveCount(0);
    await expect(result.first()).not.toHaveText('··');
    await expect(result.nth(1)).toHaveText('··');
  });
}

test('endian lab narrates the initial state and labels every memory byte with its address offset', async ({ page }) => {
  await page.goto(`en/${ENDIAN.path}`);
  const lab = await waitForLab(page, ENDIAN.labId);
  await expect(lab.locator('[data-region="little"] [role="columnheader"]')).toHaveText(['+0', '+1', '+2', '+3']);
  await expect(lab.locator('[data-region="little"] .cv-cell')).toHaveText(['··', '··', '··', '··']);
  await expect(lab.locator('.cv-narration')).toHaveText(interpolate(endianEn['plugin.endian.step.initial'], { value: '0a0b0c0d', bits: 32 }));
});

test('gf256 one-byte regions have no address gutter', async ({ page }) => {
  await page.goto(`en/${GF256.path}`);
  const lab = await waitForLab(page, GF256.labId);
  await expect(lab.locator('[data-region="a"] .cv-cell')).toBeVisible();
  await expect(lab.locator('[data-region] .cv-grid__offset')).toHaveCount(0);
});

test('gf256 lab opens on the loaded operands: initial narration and the step −1 equation', async ({ page }) => {
  await page.goto(`en/${GF256.path}`);
  const lab = await waitForLab(page, GF256.labId);
  await expect(lab.locator('[data-region="a"] .cv-cell')).toHaveText('57');
  await expect(lab.locator('[data-region="b"] .cv-cell')).toHaveText('83');
  await expect(lab.locator('.cv-narration')).toHaveText(interpolate(gf256En['plugin.gf256.step.gmul.load'], { a: '{57}', b: '{83}' }));
  await expect(lab.locator('.cv-math__formula')).toHaveText(gf256En['plugin.gf256.formula.gmulLoad']);
  await expect(lab.locator('[data-upcoming]')).toHaveCount(0);
});
