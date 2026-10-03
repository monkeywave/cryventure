import { expect, test, type Locator, type Page } from '@playwright/test';
import uiEnJson from '../src/i18n/en/ui.json' with { type: 'json' };
import xorEnJson from '../../../packages/primitives/src/xor/i18n/en.json' with { type: 'json' };
import { expectStep, labButton, seekTo, stateHex, stepCount, waitForLab } from './labPage.ts';

// The generic player and workspace on a non-AES lab: everything here must work for any primitive.

const XOR = { path: 'en/foundations/xor/', labId: 'xor-otp' } as const;
const xorEn: Record<string, string> = xorEnJson;
const uiEn: Record<string, string> = uiEnJson;

/** Preset "hello": 68656c6c6f ⊕ 2b7e151628. Message and key are the initial state; steps: 5 × XOR byte, decrypt. */
const HELLO = { message: '68656c6c6f', result: '431b797a47', resultGrouped: '431b797a 47', stepCount: 6 } as const;
const ZERO_KEY = { key: '0000000000', result: '68656c6c6f', resultGrouped: '68656c6c 6f' } as const;

async function openXorLab(page: Page, hash = ''): Promise<Locator> {
  await page.goto(`${XOR.path}${hash}`);
  const lab = await waitForLab(page, XOR.labId);
  await expect(lab.locator('[data-region="result"] .cv-cell').first()).toBeVisible();
  return lab;
}

test.describe('generic player on the XOR lab', () => {
  test('buttons and ← / → step through the trace', async ({ page }) => {
    const lab = await openXorLab(page);
    expect(await stepCount(lab)).toBe(HELLO.stepCount);
    await expectStep(lab, -1);
    const next = labButton(lab, 'ui.player.next');
    await next.click();
    await next.click();
    await expectStep(lab, 1);
    await next.focus();
    await page.keyboard.press('ArrowRight');
    await expectStep(lab, 2);
    expect((await stateHex(lab, 'result')).slice(0, 6)).toBe(HELLO.result.slice(0, 6));
    await page.keyboard.press('ArrowLeft');
    await expectStep(lab, 1);
    await labButton(lab, 'ui.player.prev').click();
    await expectStep(lab, 0);
    expect(await stateHex(lab, 'result')).toBe(`${HELLO.result.slice(0, 2)}${'··'.repeat(4)}`);
  });

  test('scrubbing the timeline jumps to exact states', async ({ page }) => {
    const lab = await openXorLab(page);
    await seekTo(lab, HELLO.stepCount - 2);
    expect(await stateHex(lab, 'result')).toBe(HELLO.result);
    await seekTo(lab, 0);
    expect(await stateHex(lab, 'result')).toBe(`${HELLO.result.slice(0, 2)}${'··'.repeat(4)}`);
    await seekTo(lab, -1);
    expect(await stateHex(lab, 'message')).toBe(HELLO.message);
    expect(await stateHex(lab, 'result')).toBe('··'.repeat(5));
  });

  test('Home and End jump to the initial state and the last step', async ({ page }) => {
    const lab = await openXorLab(page);
    await labButton(lab, 'ui.player.mode.story').focus();
    await page.keyboard.press('End');
    await expectStep(lab, HELLO.stepCount - 1);
    expect(await stateHex(lab, 'recovered')).toBe(HELLO.message);
    await page.keyboard.press('Home');
    await expectStep(lab, -1);
  });

  test('a deep link restores the step, also after reload', async ({ page }) => {
    const lab = await openXorLab(page, `#lab=${XOR.labId}&s=2&v=1`);
    await expectStep(lab, 2);
    await seekTo(lab, 3);
    await expect(page).toHaveURL(new RegExp(`#lab=${XOR.labId}&p=[\\w-]+&s=3&v=1$`));
    await page.reload();
    await expectStep(lab, 3);
    await expect.poll(() => stateHex(lab, 'result')).toBe(`${HELLO.result.slice(0, 8)}··`);
  });

  test('changing a param re-runs the lab, keeps the step and updates the output', async ({ page }) => {
    const lab = await openXorLab(page);
    await expect(lab.getByTestId('lab-output-result')).toHaveText(HELLO.resultGrouped);
    await seekTo(lab, HELLO.stepCount - 2);
    await lab.getByLabel(xorEn['plugin.xor.param.key']!).fill(ZERO_KEY.key);
    await expect(lab.getByTestId('lab-output-result')).toHaveText(ZERO_KEY.resultGrouped);
    await expect(lab.getByLabel(uiEn['ui.lab.params.preset']!)).toHaveValue('zero-key');
    await expectStep(lab, HELLO.stepCount - 2);
    expect(await stateHex(lab, 'result')).toBe(ZERO_KEY.result);
  });
});
