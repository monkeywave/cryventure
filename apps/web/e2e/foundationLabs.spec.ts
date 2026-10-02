import { expect, test } from '@playwright/test';
import { seekTo, VIZ, waitForLab, type Lang } from './labPage';

// Generic (non-AES) labs: no invented "Round n", placeholders for unwritten bytes, sensible addresses.

const XOR = { path: 'foundations/xor/', labId: 'xor-otp' } as const;
const ENDIAN = { path: 'foundations/endianness/', labId: 'endian-byte-order' } as const;
const GF256 = { path: 'foundations/gf256/', labId: 'gf256-calc' } as const;

for (const lang of ['en', 'de'] as const satisfies readonly Lang[]) {
  test(`xor lab (${lang}): no round label, unwritten bytes are placeholders`, async ({ page }) => {
    await page.goto(`${lang}/${XOR.path}`);
    const lab = await waitForLab(page, XOR.labId);
    const result = lab.locator('[data-region="result"] .cv-cell');
    await expect(result.first()).toHaveText('··');
    await expect(result.first()).toHaveAttribute('aria-label', new RegExp(`${VIZ[lang]['ui.grid.unwritten']}$`));
    await seekTo(lab, 2, lang);
    await expect(lab.locator('.cv-timeline__scope')).toHaveCount(0);
    await expect(lab.locator('.cv-narration__scope')).toHaveCount(0);
    await expect(result.first()).not.toHaveText('··');
    await expect(result.nth(1)).toHaveText('··');
  });
}

test('endian lab labels every memory byte with its address offset', async ({ page }) => {
  await page.goto(`en/${ENDIAN.path}`);
  const lab = await waitForLab(page, ENDIAN.labId);
  await expect(lab.locator('[data-region="little"] [role="columnheader"]')).toHaveText(['+0', '+1', '+2', '+3']);
  await expect(lab.locator('[data-region="little"] .cv-cell')).toHaveText(['··', '··', '··', '··']);
});

test('gf256 one-byte regions have no address gutter', async ({ page }) => {
  await page.goto(`en/${GF256.path}`);
  const lab = await waitForLab(page, GF256.labId);
  await expect(lab.locator('[data-region="a"] .cv-cell')).toBeVisible();
  await expect(lab.locator('[data-region] .cv-grid__offset')).toHaveCount(0);
});
