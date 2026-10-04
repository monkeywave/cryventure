import { expect, test, type Locator, type Page } from '@playwright/test';
import { blockingViolations } from './helpers/axe.ts';
import { C1, DESKTOP, PHONE, VIZ, WELCOME_LAB, expectStep, labButton, openLab, useStoryMode, type Lang } from './labPage.ts';

/**
 * Narrow labs (phones): the narration is a caption inside a sticky mini-player right above the
 * animated state, the key schedule is collapsed, and exactly one live region narrates.
 */
type Scheme = 'light' | 'dark';

const LABS = [
  { name: 'welcome lab', ...WELCOME_LAB },
  { name: 'AES overview', path: 'symmetric/aes/', labId: 'aes-overview' },
] as const;

const stateMatrix = (lab: Locator) => lab.locator('[data-region="state"] [role="grid"]');
const caption = (lab: Locator) => lab.locator('.cv-caption__text');
const player = (lab: Locator) => lab.locator('.cv-lab__player');
/**
 * Live regions that narrate; the parameter form's inline validation messages and the "Computing…"
 * status of a slow re-run (docs/M7.md §4, empty otherwise) are live regions of their own.
 */
const narratingLiveRegions = (lab: Locator) => lab.locator('[aria-live]:not(.cv-params__error):not(.cv-lab__computing)');

/** The part of the viewport not hidden by Starlight's fixed header. */
async function visibleBand(page: Page): Promise<{ top: number; bottom: number }> {
  const top = await page.evaluate(() => document.querySelector('header.header')?.getBoundingClientRect().bottom ?? 0);
  return { top, bottom: page.viewportSize()?.height ?? 0 };
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (rect === null) throw new Error('element is not rendered');
  return { top: rect.y, bottom: rect.y + rect.height };
}

async function expectFullyVisible(page: Page, locator: Locator): Promise<void> {
  const band = await visibleBand(page);
  const rect = await box(locator);
  expect(rect.top).toBeGreaterThanOrEqual(band.top - 0.5);
  expect(rect.bottom).toBeLessThanOrEqual(band.bottom + 0.5);
}

/** Both on screen, and the (possibly stuck) player does not cover the matrix. */
async function expectMatrixAndCaptionVisible(page: Page, lab: Locator): Promise<void> {
  await expectFullyVisible(page, stateMatrix(lab));
  await expectFullyVisible(page, caption(lab));
  expect((await box(player(lab))).bottom).toBeLessThanOrEqual((await box(stateMatrix(lab))).top + 0.5);
}

test.describe('phone layout (390×844)', () => {
  test.use({ viewport: PHONE });

  for (const { name, path, labId } of LABS) {
    for (const [lang, scheme] of [
      ['en', 'dark'],
      ['en', 'light'],
      ['de', 'light'],
      ['de', 'dark'],
    ] as const satisfies readonly (readonly [Lang, Scheme])[]) {
      test(`${name} ${lang} ${scheme}: after "next" the state matrix and the caption are on screen together`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        const lab = await openLab(page, { lang, path, labId });
        await useStoryMode(lab, lang);
        await labButton(lab, 'ui.player.next', lang).click();
        await expect(caption(lab)).not.toHaveText(VIZ[lang]['ui.narration.initial']);
        await stateMatrix(lab).scrollIntoViewIfNeeded();
        await expectMatrixAndCaptionVisible(page, lab);
      });
    }
  }

  test('the caption replaces the narration panel: one live region, no narration view', async ({ page }) => {
    const lab = await openLab(page);
    await expect(lab.locator('.cv-workspace')).toHaveAttribute('data-layout', 'stacked');
    await expect(narratingLiveRegions(lab)).toHaveCount(1);
    await expect(caption(lab)).toHaveAttribute('aria-live', 'polite');
    await expect(lab.locator('.cv-narration-view')).toHaveCount(0);
  });

  test('the key schedule is collapsed and expands on request', async ({ page }) => {
    const lab = await openLab(page);
    const toggle = lab.locator('[data-region-disclosure="w"] button');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveText(/· 176 bytes$/);
    await expect(lab.locator('[data-region="w"]')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(lab.locator('[data-region="w"] .cv-cell')).toHaveCount(176);
  });

  test('the mini-player sticks while the lab is in view and leaves with it', async ({ page }) => {
    const lab = await openLab(page, LABS[1]);
    await lab.locator('[data-region-disclosure="w"] button').click();
    await lab.locator('[data-region="w"] .cv-cell').last().scrollIntoViewIfNeeded();
    const band = await visibleBand(page);
    const stuck = await box(player(lab));
    expect(Math.abs(stuck.top - band.top)).toBeLessThanOrEqual(1);
    await expectFullyVisible(page, lab.getByRole('group', { name: VIZ.en['ui.player.controls'] }));
    await expectFullyVisible(page, caption(lab));

    await page.evaluate(() => window.scrollBy(0, document.documentElement.scrollHeight));
    const labBottom = (await box(lab.locator('section.cv-lab'))).bottom;
    expect(labBottom).toBeLessThan(band.top);
    expect((await box(player(lab))).bottom).toBeLessThanOrEqual(labBottom + 0.5);
  });

  test('a long caption is clamped and can be expanded accessibly', async ({ page }) => {
    const lab = await openLab(page);
    const text = caption(lab);
    const clampedHeight = (await box(text)).bottom - (await box(text)).top;
    const lineHeight = await text.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
    expect(clampedHeight).toBeLessThanOrEqual(lineHeight * 3 + 1);
    const toggle = lab.getByRole('button', { name: VIZ.en['ui.caption.expand'] });
    if ((await toggle.count()) === 0) return; // the current text fits in three lines
    await toggle.click();
    await expect(lab.getByRole('button', { name: VIZ.en['ui.caption.collapse'] })).toHaveAttribute('aria-expanded', 'true');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious or critical axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const lab = await openLab(page, LABS[1]);
      await lab.locator('[data-region-disclosure="w"] button').click();
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('story steps land exactly with the caption in sync', async ({ page }) => {
      const lab = await openLab(page);
      await useStoryMode(lab);
      await labButton(lab, 'ui.player.next').click();
      await expect(caption(lab)).not.toHaveText(VIZ.en['ui.narration.initial']);
      await stateMatrix(lab).scrollIntoViewIfNeeded();
      await expectMatrixAndCaptionVisible(page, lab);
    });
  });
});

test.describe('desktop layout (1280)', () => {
  test.use({ viewport: DESKTOP });

  for (const { name, path, labId } of LABS) {
    test(`${name}: narration stays in its panel, no caption, one live region`, async ({ page }) => {
      const lab = await openLab(page, { path, labId });
      await expect(lab.locator('.cv-workspace')).toHaveAttribute('data-layout', 'columns');
      await expect(lab.locator('.cv-caption')).toHaveCount(0);
      await expect(lab.locator('.cv-narration-view')).toBeVisible();
      await expect(narratingLiveRegions(lab)).toHaveCount(1);
      await expect(lab.locator('[data-region-disclosure="w"] button')).toHaveAttribute('aria-expanded', 'true');
      await expect(player(lab)).not.toHaveCSS('position', 'sticky');
    });
  }
});

/** Screenshots for review: mid-ShiftRows in story mode, then scrolled to the key schedule's end. */
test.describe('phone screenshots', () => {
  test.use({ viewport: PHONE });

  for (const [lang, scheme] of [
    ['en', 'dark'],
    ['de', 'light'],
  ] as const) {
    test(`mobile ${lang} ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const lab = await openLab(page, { lang, step: C1.step.round1SubBytes });
      await useStoryMode(lab, lang);
      await lab.locator('.cv-controls__speed select').selectOption('0.5');
      await labButton(lab, 'ui.player.play', lang).click();
      await expectStep(lab, C1.step.round1ShiftRows, { lang });
      await page.waitForTimeout(900);
      await labButton(lab, 'ui.player.pause', lang).click();
      await stateMatrix(lab).scrollIntoViewIfNeeded();
      await expectMatrixAndCaptionVisible(page, lab);
      await page.screenshot({ path: `test-results/mobile-${lang}-${scheme}-shiftrows.png` });

      await lab.locator('[data-region-disclosure="w"] button').click();
      await lab.locator('[data-region="w"] .cv-cell').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/mobile-${lang}-${scheme}-scrolled.png` });
    });
  }
});
