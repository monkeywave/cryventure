import { expect, test, type Locator, type Page } from '@playwright/test';
import vizEn from '../../../packages/viz/src/i18n/en.json' with { type: 'json' };
import aesEnJson from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import { LAB_ID, LAB_PAGE, openLab } from './labPage.ts';

const aesEn: Record<string, string> = aesEnJson;
const STEP_COUNT = 43;
/** FIPS 197 C.1 at 'op' detail: round 1 = steps 3…6, round 2 starts at step 7, first MixColumns = step 5. */
const ROUND1_SUBBYTES_STEP = 3;
const ROUND2_START_STEP = 7;
const FIRST_MIX_COLUMNS_STEP = 5;
const MIX_COLUMNS_ROUNDS = 9;
const C1_CIPHERTEXT = '69c4e0d86a7b0430d8cdb78070b4c55a';
const C1_ROUND1_SBOX_FIRST_BYTE = '63';

const stepText = (step: number) => vizEn['ui.player.stepOf'].replace('{{current}}', String(step + 1)).replace('{{total}}', String(STEP_COUNT));
const stepOutput = (lab: Locator) => lab.locator('.cv-timeline__step');
const button = (lab: Locator, key: keyof typeof vizEn) => lab.getByRole('button', { name: vizEn[key], exact: true });
/** Producer op label, or the raw op name when the producer has no key (the viz fallback). */
const opLabel = (op: string) => aesEn[`plugin.aes.op.${op}`] ?? op;

async function stateHex(lab: Locator): Promise<string> {
  const cells = lab.locator('[data-region="state"] .cv-cell');
  const pairs = await cells.evaluateAll((nodes) =>
    nodes.map((node) => [Number(node.getAttribute('data-index')), node.querySelector('.cv-cell__value')?.textContent?.trim() ?? ''] as const),
  );
  return pairs
    .sort(([a], [b]) => a - b)
    .map(([, hex]) => hex)
    .join('');
}

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

async function seekTo(lab: Locator, step: number): Promise<void> {
  await lab.getByRole('slider', { name: vizEn['ui.player.timeline'] }).fill(String(step));
  await expect(stepOutput(lab)).toHaveText(stepText(step));
}

async function useStoryMode(lab: Locator): Promise<void> {
  const story = button(lab, 'ui.player.mode.story');
  await story.click();
  await expect(story).toHaveAttribute('aria-pressed', 'true');
}

async function openLabAt(page: Page, step: number): Promise<Locator> {
  return openLab(page, `${LAB_PAGE('en')}#lab=${LAB_ID}&s=${step}&v=1`);
}

test.describe('player modes', () => {
  test('story mode: play advances with choreography and the narration changes', async ({ page }) => {
    const lab = await openLab(page);
    await useStoryMode(lab);
    const narration = lab.locator('.cv-narration');
    const initialNarration = (await narration.textContent()) ?? '';
    await button(lab, 'ui.player.play').click();
    await expect(stepOutput(lab)).toHaveText(stepText(1), { timeout: 10_000 });
    await expect(narration).not.toHaveText(initialNarration);
    await button(lab, 'ui.player.pause').click();
    await expect(button(lab, 'ui.player.play')).toBeVisible();
  });

  test('debugger: "next round" jumps to round starts (round 2 = step 8), Shift+← goes back', async ({ page }) => {
    const lab = await openLab(page);
    const nextRound = button(lab, 'ui.player.nextRound');
    await nextRound.click();
    await nextRound.click();
    await nextRound.click();
    await expect(stepOutput(lab)).toHaveText(stepText(ROUND2_START_STEP));
    await expect(lab.locator('.cv-timeline__scope')).toContainText(aesEn['plugin.aes.scope.round']!.replace('{{value}}', '2'));
    await nextRound.focus();
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(stepOutput(lab)).toHaveText(stepText(ROUND1_SUBBYTES_STEP));
    expect(await lab.locator('.cv-timeline__mark--round').count()).toBeGreaterThanOrEqual(10);
  });

  test('debugger: a breakpoint on MixColumns stops playback there', async ({ page }) => {
    const lab = await openLab(page);
    const chip = lab.getByRole('group', { name: vizEn['ui.player.breakpoints'] }).getByRole('button', { name: opLabel('mixColumns'), exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(lab.locator('.cv-timeline__mark--breakpoint')).toHaveCount(MIX_COLUMNS_ROUNDS);
    await button(lab, 'ui.player.play').click();
    await expect(stepOutput(lab)).toHaveText(stepText(FIRST_MIX_COLUMNS_STEP), { timeout: 10_000 });
    await expect(button(lab, 'ui.player.play')).toBeVisible();
    await page.waitForTimeout(1_200);
    await expect(stepOutput(lab)).toHaveText(stepText(FIRST_MIX_COLUMNS_STEP));
  });

  test('debugger: B toggles the breakpoint of the current op; a clicked cell is watched', async ({ page }) => {
    const lab = await openLabAt(page, ROUND1_SUBBYTES_STEP);
    const firstCell = lab.locator('[data-region="state"] .cv-cell[data-index="0"]');
    await firstCell.click();
    await expect(firstCell).toHaveAttribute('aria-selected', 'true');
    await expect(lab.locator('.cv-watch__entry[aria-current="step"]')).toContainText('0x63');
    await page.keyboard.press('b');
    await expect(lab.getByRole('button', { name: opLabel('subBytes'), exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('story steps and playback show exact end states without motion', async ({ page }) => {
    const lab = await openLab(page);
    await useStoryMode(lab);
    const next = button(lab, 'ui.player.next');
    for (let step = 0; step <= ROUND1_SUBBYTES_STEP; step++) await next.click();
    await expect(stepOutput(lab)).toHaveText(stepText(ROUND1_SUBBYTES_STEP));
    expect((await stateHex(lab)).slice(0, 2)).toBe(C1_ROUND1_SBOX_FIRST_BYTE);
    expect(await restingCells(lab)).toBe(true);

    await button(lab, 'ui.player.play').click();
    await expect(stepOutput(lab)).not.toHaveText(stepText(ROUND1_SUBBYTES_STEP), { timeout: 10_000 });
    await button(lab, 'ui.player.pause').click();
    const pausedAt = Number(/\d+/.exec((await stepOutput(lab).textContent()) ?? '')?.[0]) - 1;
    const played = await stateHex(lab);
    await seekTo(lab, -1);
    await seekTo(lab, pausedAt);
    expect(await stateHex(lab)).toBe(played);

    await button(lab, 'ui.player.last').click();
    expect(await stateHex(lab)).toBe(C1_CIPHERTEXT);
  });
});

test.describe('screenshots', () => {
  test.use({ colorScheme: 'dark' });

  test('story mode mid-ShiftRows (progress ≈ 0.5)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    const lab = await openLabAt(page, ROUND1_SUBBYTES_STEP);
    await useStoryMode(lab);
    await lab.getByLabel(vizEn['ui.player.speed']).selectOption('0.5');
    await button(lab, 'ui.player.next').click();
    // ShiftRows lasts 2.5 s at 1× → 5 s at 0.5×; half-way is ≈ 2.5 s after the click.
    await page.waitForTimeout(2_500);
    await lab.screenshot({ path: 'test-results/story-shiftrows.png' });
    await expect(lab.locator('[data-region="state"] .cv-cell[data-animated]').first()).toBeVisible();
  });
});
