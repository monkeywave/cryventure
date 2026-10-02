import { expect, test, type Locator } from '@playwright/test';
import { interpolate } from '@cryventure/core';
import vizEn from '../../../packages/viz/src/i18n/en.json' with { type: 'json' };
import aesEnJson from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import { C1, DESKTOP, expectStep, labButton, openLab, seekTo, stateHex, stepOutput, stepText, useStoryMode } from './labPage.ts';

const aesEn: Record<string, string> = aesEnJson;

/** Producer op label, or the raw op name when the producer has no key (the viz fallback). */
const opLabel = (op: string) => aesEn[`plugin.aes.op.${op}`] ?? op;

/** Every state cell sits at its grid position, fully opaque and unscaled (no motion in flight). */
async function restingCells(lab: Locator): Promise<boolean> {
  return lab.locator('[data-region="state"] .cv-cell').evaluateAll((nodes) =>
    nodes.every((node) => {
      const style = getComputedStyle(node);
      const still = (value: string) => value === 'none' || /^0px( 0px)?$/.test(value);
      return still(style.translate) && (style.scale === 'none' || style.scale === '1') && style.opacity === '1';
    }),
  );
}

test.describe('player modes', () => {
  test('story mode: play advances with choreography and the narration changes', async ({ page }) => {
    const lab = await openLab(page);
    await useStoryMode(lab);
    const narration = lab.locator('.cv-narration');
    const initialNarration = (await narration.textContent()) ?? '';
    await labButton(lab, 'ui.player.play').click();
    await expectStep(lab, 1, { timeout: 10_000 });
    await expect(narration).not.toHaveText(initialNarration);
    await labButton(lab, 'ui.player.pause').click();
    await expect(labButton(lab, 'ui.player.play')).toBeVisible();
  });

  test('debugger: "next round" jumps to round starts (round 2 = step 8), Shift+← goes back', async ({ page }) => {
    const lab = await openLab(page);
    const nextRound = lab.getByRole('button', { name: aesEn['plugin.aes.scope.roundNext'], exact: true });
    await nextRound.click();
    await nextRound.click();
    await nextRound.click();
    await expectStep(lab, C1.step.round2Start);
    await expect(lab.locator('.cv-timeline__scope')).toContainText(interpolate(aesEn['plugin.aes.scope.round']!, { value: 2 }));
    await nextRound.focus();
    await page.keyboard.press('Shift+ArrowLeft');
    await expectStep(lab, C1.step.round1SubBytes);
    expect(await lab.locator('.cv-timeline__mark--round').count()).toBeGreaterThanOrEqual(10);
  });

  test('debugger: a breakpoint on MixColumns stops playback there', async ({ page }) => {
    const lab = await openLab(page);
    const chip = lab.getByRole('group', { name: vizEn['ui.player.breakpoints'] }).getByRole('button', { name: opLabel('mixColumns'), exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(lab.locator('.cv-timeline__mark--breakpoint')).toHaveCount(C1.mixColumnsRounds);
    await labButton(lab, 'ui.player.play').click();
    await expectStep(lab, C1.step.round1MixColumns, { timeout: 10_000 });
    await expect(labButton(lab, 'ui.player.play')).toBeVisible();
    await page.waitForTimeout(1_200);
    await expectStep(lab, C1.step.round1MixColumns);
  });

  test('debugger: B toggles the breakpoint of the current op; a clicked cell is watched', async ({ page }) => {
    const lab = await openLab(page, { step: C1.step.round1SubBytes });
    const firstCell = lab.locator('[data-region="state"] .cv-cell[data-index="0"]');
    await firstCell.click();
    await expect(firstCell).toHaveAttribute('aria-selected', 'true');
    await expect(lab.locator('.cv-watch__entry[aria-current="step"]')).toContainText(`0x${C1.round1SboxFirstByte}`);
    await page.keyboard.press('b');
    await expect(lab.getByRole('button', { name: opLabel('subBytes'), exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('story steps and playback show exact end states without motion', async ({ page }) => {
    const lab = await openLab(page);
    await useStoryMode(lab);
    const next = labButton(lab, 'ui.player.next');
    for (let step = 0; step <= C1.step.round1SubBytes; step++) await next.click();
    await expectStep(lab, C1.step.round1SubBytes);
    expect((await stateHex(lab)).slice(0, 2)).toBe(C1.round1SboxFirstByte);
    expect(await restingCells(lab)).toBe(true);

    await labButton(lab, 'ui.player.play').click();
    await expect(stepOutput(lab)).not.toHaveText(await stepText(lab, C1.step.round1SubBytes), { timeout: 10_000 });
    await labButton(lab, 'ui.player.pause').click();
    const pausedAt = Number(/\d+/.exec((await stepOutput(lab).textContent()) ?? '')?.[0]) - 1;
    const played = await stateHex(lab);
    await seekTo(lab, -1);
    await seekTo(lab, pausedAt);
    expect(await stateHex(lab)).toBe(played);

    await labButton(lab, 'ui.player.last').click();
    expect(await stateHex(lab)).toBe(C1.ciphertext);
  });
});

test.describe('screenshots', () => {
  test.use({ colorScheme: 'dark' });

  test('story mode mid-ShiftRows (progress ≈ 0.5)', async ({ page }) => {
    await page.setViewportSize({ width: DESKTOP.width, height: 1400 });
    const lab = await openLab(page, { step: C1.step.round1SubBytes });
    await useStoryMode(lab);
    await lab.getByLabel(vizEn['ui.player.speed']).selectOption('0.5');
    await labButton(lab, 'ui.player.next').click();
    // ShiftRows lasts 2.5 s at 1× → 5 s at 0.5×; half-way is ≈ 2.5 s after the click.
    await page.waitForTimeout(2_500);
    await lab.screenshot({ path: 'test-results/story-shiftrows.png' });
    await expect(lab.locator('[data-region="state"] .cv-cell[data-animated]').first()).toBeVisible();
  });
});
