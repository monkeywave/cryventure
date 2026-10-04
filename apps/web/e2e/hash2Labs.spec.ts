import { expect, test, type Locator, type Page } from '@playwright/test';
import { interpolate, type Lens } from '@cryventure/core';
import uiEn from '../src/i18n/en/ui.json' with { type: 'json' };
import uiDe from '../src/i18n/de/ui.json' with { type: 'json' };
import sha3En from '../../../packages/primitives/src/sha3/i18n/en.json' with { type: 'json' };
import sha3De from '../../../packages/primitives/src/sha3/i18n/de.json' with { type: 'json' };
import { M6_HASH_LESSONS } from './hashLessons.ts';
import { PHONE, mountLabs, seekTo, setLens, waitForLab, type Lang } from './labPage.ts';

// M6 labs beyond the sponge view (docs/M6.md §4, §5, §7): the BLAKE2 4 × 4 register matrix in
// `wordops`, the two derived ARMv8.2 views, the cSHAKE param panel, and phones without page scroll.

const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];

/* ---------- BLAKE2: the 4 × 4 matrix with the G column / diagonal highlighted ---------- */

const BLAKE2S = { path: 'en/hash/blake2/', labId: 'blake2s-256-abc' } as const;
/** blake2s-256-abc (startAt op:g): step 2 is G0 of round 1 (column 0), step 6 is G4 (the main diagonal). */
const G_STEP = { column0: 2, diagonal0: 6 } as const;

const grid = (lab: Locator, side: 'before' | 'after') => lab.locator(`.cv-wordops__grid[data-side="${side}"]`);
const touched = (lab: Locator) =>
  grid(lab, 'after')
    .locator('.cv-wordops__reg[data-touched]')
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-register')));
/** [column, row] of each touched cell in the rendered grid, from the cells' positions. */
const touchedPlaces = (lab: Locator) =>
  grid(lab, 'after').evaluate((element) => {
    const cells = [...element.querySelectorAll<HTMLElement>('.cv-wordops__reg')];
    const lefts = [...new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().left)))].sort((a, b) => a - b);
    const tops = [...new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top)))].sort((a, b) => a - b);
    return cells
      .filter((cell) => cell.hasAttribute('data-touched'))
      .map((cell) => [lefts.indexOf(Math.round(cell.getBoundingClientRect().left)), tops.indexOf(Math.round(cell.getBoundingClientRect().top))]);
  });

test.describe('BLAKE2s G lab (wordops 4 × 4 registers)', () => {
  test('before and after are 4 × 4 grids of v0 … v15', async ({ page }) => {
    await page.goto(BLAKE2S.path);
    const lab = await waitForLab(page, BLAKE2S.labId);
    for (const side of ['before', 'after'] as const) {
      await expect(grid(lab, side)).toHaveAttribute('data-columns', '4');
      await expect(grid(lab, side).locator('.cv-wordops__reg')).toHaveCount(16);
    }
    await expect(lab.locator('.cv-wordops__legend')).toBeVisible();
  });

  test('G0 touches column 0 (v0, v4, v8, v12); G4 touches the diagonal (v0, v5, v10, v15)', async ({ page }) => {
    await page.goto(BLAKE2S.path);
    const lab = await waitForLab(page, BLAKE2S.labId);
    await seekTo(lab, G_STEP.column0);
    await expect.poll(() => touched(lab)).toEqual(['v0', 'v4', 'v8', 'v12']);
    expect(await touchedPlaces(lab)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);

    await seekTo(lab, G_STEP.diagonal0);
    await expect.poll(() => touched(lab)).toEqual(['v0', 'v5', 'v10', 'v15']);
    expect(await touchedPlaces(lab)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    // Only the touched words change in a G call.
    await expect(grid(lab, 'after').locator('.cv-wordops__reg[data-changed]:not([data-touched])')).toHaveCount(0);
  });
});

/* ---------- the derived ARMv8.2 views ---------- */

/** variant aarch64-armv8-sha512 / aarch64-armv8-sha3, set by the lesson's <Lab variant=…>. */
const ARM_LABS = [
  { name: 'SHA-512', path: 'en/hash/sha512/', labId: 'sha512-armv8', mnemonics: { sha512h: 40, sha512h2: 40, sha512su0: 32, sha512su1: 32 } },
  // The deriver repeats the one-round loop body 24 times (docs/M6.md §5b): 10 eor3, 5 rax1, 25 xar, 25 bcax per round.
  { name: 'SHA3', path: 'en/hash/keccak/', labId: 'sha3-256-armv8', mnemonics: { eor3: 240, rax1: 120, xar: 600, bcax: 600 } },
] as const;

const mnemonicCounts = (lab: Locator) =>
  lab.locator('.cv-instructions__mnemonic').evaluateAll((cells) => {
    const counts: Record<string, number> = {};
    for (const cell of cells) {
      const name = cell.textContent?.trim() ?? '';
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return counts;
  });

for (const { name, path, labId, mnemonics } of ARM_LABS) {
  test(`derived ARMv8.2 ${name} view: the listing has ${Object.keys(mnemonics).join('/')} and the registers panel has rows`, async ({ page }) => {
    await page.goto(path);
    const lab = await waitForLab(page, labId);
    await expect(lab.locator('.cv-instructions__row').first()).toBeVisible();
    expect(await mnemonicCounts(lab)).toMatchObject(mnemonics);
    await expect(lab.locator('.cv-instructions__row[data-status="current"]')).not.toHaveCount(0);
    const rows = lab.locator('.cv-registers .cv-grid__row:not(.cv-grid__head)');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first().locator('.cv-cell__value').first()).toHaveText(/^[0-9a-f]{2}$/);
  });
}

/* ---------- the cSHAKE param panel: N and S count UTF-8 bytes while the message is hex ---------- */

const UI = { en: uiEn, de: uiDe } as const;
const SHA3 = { en: sha3En, de: sha3De } as const;

const textField = (lab: Locator, label: string) => lab.locator('.cv-params__field--text').filter({ has: lab.page().getByLabel(label, { exact: true }) });
const counter = (lab: Locator, label: string) => textField(lab, label).locator('.cv-params__count');

for (const lang of ['en', 'de'] as const satisfies readonly Lang[]) {
  test(`cSHAKE param panel (${lang}): the hex message counts decoded bytes, N and S count UTF-8 bytes`, async ({ page }) => {
    await page.goto(`${lang}/hash/sponge/`);
    const lab = await waitForLab(page, 'cshake128-sample1');
    const sha3 = SHA3[lang];
    const ui = UI[lang];
    const utf8 = (count: number, max: number) => interpolate(ui['ui.lab.params.byteCount'], { count, max });
    const hex = (count: number, max: number) => interpolate(ui['ui.lab.params.byteCountHex'], { count, max });

    await expect(counter(lab, sha3['plugin.sha3.param.input'])).toHaveText(hex(4, 200));
    await expect(counter(lab, sha3['plugin.sha3.param.functionName'])).toHaveText(utf8(0, 64));
    await expect(counter(lab, sha3['plugin.sha3.param.customization'])).toHaveText(utf8(15, 64)); // "Email Signature"

    // Hex-looking N stays text: "abcd" is four UTF-8 bytes, not two decoded ones.
    await lab.getByLabel(sha3['plugin.sha3.param.functionName'], { exact: true }).fill('abcd');
    await expect(counter(lab, sha3['plugin.sha3.param.functionName'])).toHaveText(utf8(4, 64));
    // Non-ASCII S: "Grüße" is 7 UTF-8 bytes.
    await lab.getByLabel(sha3['plugin.sha3.param.customization'], { exact: true }).fill('Grüße');
    await expect(counter(lab, sha3['plugin.sha3.param.customization'])).toHaveText(utf8(7, 64));
    // 65 bytes of S is over the limit.
    await lab.getByLabel(sha3['plugin.sha3.param.customization'], { exact: true }).fill('a'.repeat(65));
    await expect(counter(lab, sha3['plugin.sha3.param.customization'])).toHaveAttribute('data-over', 'true');
  });
}

/* ---------- phones: wide grids and listings scroll inside their panels, never the page ---------- */

const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

test.describe('M6 hash lessons at 390px', () => {
  test.use({ viewport: PHONE });
  for (const { slug } of M6_HASH_LESSONS) {
    for (const lens of LENSES) {
      test(`en/${slug} never scrolls the page sideways (${lens} lens)`, async ({ page }) => {
        test.slow();
        await page.goto(`en/${slug}`);
        await setLens(page, lens);
        await mountLabs(page);
        expect(await pageOverflow(page)).toBe(0);
      });
    }
  }
});
