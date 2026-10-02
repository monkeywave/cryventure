import { expect, test } from '@playwright/test';
import { interpolate } from '@cryventure/core';
import vizEn from '../../../packages/viz/src/i18n/en.json' with { type: 'json' };
import aesEnJson from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import { C1, expectStep, labLocator, openLab, waitForLab } from './labPage.ts';

const aesEn: Record<string, string> = aesEnJson;
const B_PLAINTEXT = '3243f6a8885a308d313198a2e0370734';
const SUBBYTES_LAB = { path: 'en/symmetric/aes/subbytes-sbox/', labId: 'aes-subbytes', heading: 'check-yourself' } as const;
/** At 'op' detail: round 7 MixColumns (round r starts at 3 + 4 (r − 1)). */
const ROUND_7_MIX_COLUMNS = 29;

const roundLabel = (round: number) => interpolate(aesEn['plugin.aes.scope.round']!, { value: round });

test.describe('re-running a lab with new params', () => {
  test('keeps the breakpoint, the watched cell and the step', async ({ page }) => {
    const lab = await openLab(page, { step: C1.step.round1SubBytes });
    const cell = lab.locator('[data-region="state"] .cv-cell[data-index="5"]');
    await cell.click();
    const chip = lab.getByRole('group', { name: vizEn['ui.player.breakpoints'] }).getByRole('button', { name: aesEn['plugin.aes.op.mixColumns'], exact: true });
    await chip.click();
    await lab.getByLabel(aesEn['plugin.aes.param.plaintext']!).fill(B_PLAINTEXT);
    await expect(lab.getByTestId('lab-output-ciphertext')).not.toHaveText(C1.ciphertextWords);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(cell).toHaveAttribute('aria-selected', 'true');
    await expectStep(lab, C1.step.round1SubBytes);
  });

  test('switching to whole rounds keeps the playhead in the same round', async ({ page }) => {
    const lab = await openLab(page, { step: ROUND_7_MIX_COLUMNS });
    const scope = lab.locator('.cv-timeline__scope');
    await expect(scope).toContainText(roundLabel(7));
    await lab.getByLabel(aesEn['plugin.aes.param.detail']!).selectOption({ label: aesEn['plugin.aes.param.detailOption.round']! });
    await expect(lab.locator('.cv-timeline__slider')).not.toHaveAttribute('max', String(C1.stepCount - 1));
    await expect(scope).toContainText(roundLabel(7));
  });
});

test.describe('lab deep links next to heading anchors', () => {
  test('stepping keeps the heading anchor, and the shared link scrolls to the heading', async ({ page, context }) => {
    await page.goto(`${SUBBYTES_LAB.path}#${SUBBYTES_LAB.heading}`);
    const lab = await waitForLab(page, SUBBYTES_LAB.labId);
    await lab.getByRole('button', { name: vizEn['ui.player.next'], exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${SUBBYTES_LAB.heading}&lab=${SUBBYTES_LAB.labId}&p=[\\w-]+&s=\\d+&v=1$`));
    const shared = page.url();

    const opened = await context.newPage();
    await opened.goto(shared);
    await expect(opened.locator(`#${SUBBYTES_LAB.heading}`)).toBeInViewport();

    await opened.reload();
    await expect(opened).toHaveURL(shared);
    await expect(labLocator(opened, SUBBYTES_LAB.labId)).toBeAttached();
  });
});
