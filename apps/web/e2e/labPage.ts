import { expect, type Locator, type Page } from '@playwright/test';
import { interpolate, type Lens, type Locale } from '@cryventure/core';
import vizEn from '../../../packages/viz/src/i18n/en.json' with { type: 'json' };
import vizDe from '../../../packages/viz/src/i18n/de.json' with { type: 'json' };

// Relative URLs resolve against baseURL, so the suites run unchanged for CV_BASE sub-path builds.

export type Lang = Locale;
export type VizKey = keyof typeof vizEn;

export const VIZ: Record<Lang, typeof vizEn> = { en: vizEn, de: vizDe };
export const PHONE = { width: 390, height: 844 };
export const DESKTOP = { width: 1280, height: 900 };

export const WELCOME_LAB = { path: 'foundations/welcome-lab/', labId: 'aes-intro' } as const;
export const KEY_SCHEDULE_LAB = { path: 'symmetric/aes/key-expansion/', labId: 'aes-key-schedule' } as const;
export const LAB_ID = WELCOME_LAB.labId;

/** FIPS 197 App. C.1 (AES-128) as traced at 'op' detail. */
export const C1 = {
  ciphertext: '69c4e0d86a7b0430d8cdb78070b4c55a',
  ciphertextWords: '69c4e0d8 6a7b0430 d8cdb780 70b4c55a',
  /** round[1].s_box, first byte. */
  round1SboxFirstByte: '63',
  stepCount: 43,
  mixColumnsRounds: 9,
  step: { round1SubBytes: 3, round1ShiftRows: 4, round1MixColumns: 5, round1AddRoundKey: 6, round2Start: 7 },
} as const;

export interface OpenLabOptions {
  path?: string;
  labId?: string;
  lang?: Lang;
  /** Raw URL hash, e.g. `#lab=…&p=…`. */
  hash?: string;
  /** Deep-links to this step (ignored when `hash` is given). */
  step?: number;
}

export const labLocator = (page: Page, labId: string = LAB_ID) => page.locator(`[data-lab-id="${labId}"]`);
export const stepOutput = (lab: Locator) => lab.locator('.cv-timeline__step');
export const labButton = (lab: Locator, key: VizKey, lang: Lang = 'en') =>
  lab.getByRole('button', { name: VIZ[lang][key], exact: true });

/** Waits until the lab island has replaced its static poster with the interactive workspace. */
export async function waitForLab(page: Page, labId: string = LAB_ID): Promise<Locator> {
  const lab = labLocator(page, labId);
  await lab.scrollIntoViewIfNeeded();
  await expect(lab.locator('section.cv-lab')).toBeVisible();
  return lab;
}

/** Opens a lab page and waits for hydration, including the code-split state view's grid. */
export async function openLab(page: Page, options: OpenLabOptions = {}): Promise<Locator> {
  const { path = WELCOME_LAB.path, labId = LAB_ID, lang = 'en', step } = options;
  const hash = options.hash ?? (step === undefined ? '' : `#lab=${labId}&s=${step}&v=1`);
  await page.goto(`${lang}/${path}${hash}`);
  const lab = await waitForLab(page, labId);
  await expect(lab.locator('[data-region="state"] .cv-cell').first()).toBeVisible();
  return lab;
}

/** Number of trace steps, as exposed by the timeline slider (max = last step index). */
export async function stepCount(lab: Locator): Promise<number> {
  const max = await lab.locator('.cv-timeline__slider').getAttribute('max');
  return Number(max) + 1;
}

/** Localized "Step x / n" for the 0-based `step` (-1 = initial state). */
export async function stepText(lab: Locator, step: number, lang: Lang = 'en'): Promise<string> {
  return interpolate(VIZ[lang]['ui.player.stepOf'], { current: step + 1, total: await stepCount(lab) });
}

export async function expectStep(lab: Locator, step: number, options: { lang?: Lang; timeout?: number } = {}): Promise<void> {
  await expect(stepOutput(lab)).toHaveText(await stepText(lab, step, options.lang), { timeout: options.timeout });
}

/** Moves the timeline slider and waits until the player shows that step. */
export async function seekTo(lab: Locator, step: number, lang: Lang = 'en'): Promise<void> {
  await lab.getByRole('slider', { name: VIZ[lang]['ui.player.timeline'] }).fill(String(step));
  await expectStep(lab, step, { lang });
}

export async function useStoryMode(lab: Locator, lang: Lang = 'en'): Promise<void> {
  const story = labButton(lab, 'ui.player.mode.story', lang);
  await story.click();
  await expect(story).toHaveAttribute('aria-pressed', 'true');
}

/** A state region (default: the AES state matrix) as one hex string, in byte-index order; unwritten bytes read `··`. */
export async function stateHex(lab: Locator, region = 'state'): Promise<string> {
  const pairs = await lab.locator(`[data-region="${region}"] .cv-cell`).evaluateAll((nodes) =>
    nodes.map((node) => [Number(node.getAttribute('data-index')), node.querySelector('.cv-cell__value')?.textContent?.trim() ?? ''] as const),
  );
  return pairs
    .sort(([a], [b]) => a - b)
    .map(([, hex]) => hex)
    .join('');
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Sets the page lens the way the header selector does (on a phone it sits in the collapsed menu). */
export async function setLens(page: Page, lens: Lens): Promise<void> {
  await page.evaluate((value) => {
    const select = document.querySelector<HTMLSelectElement>('cv-lens-select select');
    if (!select) throw new Error('lens selector missing');
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, lens);
  await expect(page.locator('html')).toHaveAttribute('data-lens', lens);
}

/** Labs mount when they scroll into view; bring each one in and wait until it is interactive. */
export async function mountLabs(page: Page): Promise<void> {
  const labs = page.locator('[data-lab-id]');
  const count = await labs.count();
  for (let index = 0; index < count; index += 1) {
    await labs.nth(index).scrollIntoViewIfNeeded();
    await expect(labs.nth(index).locator('section.cv-lab')).toBeVisible({ timeout: 15_000 });
  }
}
