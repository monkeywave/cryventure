import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import vizEn from '../../../packages/viz/src/i18n/en.json' with { type: 'json' };
import { contrastRatio, effectiveBackground, parseCssColor } from './helpers/contrast.ts';
import { LAB_ID, LAB_PAGE, openLab } from './labPage.ts';

/**
 * Static legibility: in light and dark, desktop and phone, every state cell (dimmed or focused by the
 * current beat), the lab's muted labels and the key schedule's chain lines are fully opaque and keep
 * WCAG AA text contrast (≥ 4.5:1) against their effective background. Screenshots for review go to
 * test-results/contrast-*.png.
 */
type Scheme = 'light' | 'dark';

const AA_TEXT = 4.5;
const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const VIEWPORTS = [
  ['desktop', { width: 1280, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
] as const;
/** FIPS 197 C.1 at 'op' detail: step 4 ends round 1's ShiftRows, step 5 is its MixColumns (4 column beats). */
const SHIFT_ROWS_STEP = 4;
const MIX_COLUMNS_STEP_TEXT = vizEn['ui.player.stepOf'].replace('{{current}}', '6').replace('{{total}}', '43');
const STATE_CELLS = '[data-region="state"] .cv-cell';
/** Muted / secondary text of the player and views, wherever present. */
const LAB_LABELS = [
  '.cv-timeline__scope',
  '.cv-timeline__step',
  '.cv-breakpoints__title',
  '.cv-breakpoints__hint',
  '.cv-region__title',
  '.cv-grid__offset',
  '.cv-narration__scope',
  '.cv-watch__hint',
  '.cv-caption__text',
].join(', ');
const KEY_SCHEDULE_LAB_ID = 'aes-key-schedule';
const KEY_SCHEDULE_PAGE = 'en/symmetric/aes/key-expansion/';
const KEY_SCHEDULE_TEXT = [
  '.cv-keyschedule__hint',
  '.cv-keyschedule__label',
  '.cv-keyschedule__word',
  '.cv-keyschedule__chain-title',
  '.cv-keyschedule__name',
  '.cv-keyschedule__hex',
].join(', ');

interface TextSample {
  name: string;
  color: string;
  /** Background colours from the element outwards to <html>. */
  backgrounds: string[];
  /** Opacity of the element and every ancestor up to the lab. */
  opacities: number[];
}

/** Computed colours and opacities of every element matching `selector` inside `lab`. */
async function sampleText(lab: Locator, selector: string): Promise<TextSample[]> {
  return lab.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const backgrounds: string[] = [];
      const opacities: number[] = [];
      const labRoot = element.closest('[data-lab-id]');
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        backgrounds.push(style.backgroundColor);
        if (labRoot?.contains(node)) opacities.push(Number(style.opacity));
      }
      const name = `${element.className} "${(element.textContent ?? '').trim().slice(0, 24)}"`;
      return { name, color: getComputedStyle(element).color, backgrounds, opacities };
    }),
  );
}

/** Elements below AA text contrast, or translucent, as readable failure lines. */
function illegible(samples: readonly TextSample[]): string[] {
  return samples.flatMap((sample) => {
    const background = effectiveBackground(sample.backgrounds.map(parseCssColor));
    const ratio = contrastRatio(parseCssColor(sample.color), background);
    const translucent = sample.opacities.some((opacity) => opacity < 1);
    if (ratio >= AA_TEXT && !translucent) return [];
    return [`${sample.name}: ${ratio.toFixed(2)}:1${translucent ? `, opacity ${sample.opacities.join('·')}` : ''}`];
  });
}

async function expectLegible(lab: Locator, selector: string): Promise<void> {
  const samples = await sampleText(lab, selector);
  expect(samples.length).toBeGreaterThan(0);
  // Cell value flashes (300 ms) may still be settling right after a value flip.
  await expect.poll(async () => illegible(await sampleText(lab, selector))).toEqual([]);
}

async function colorContrastViolations(page: Page, labId: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).include(`[data-lab-id="${labId}"]`).withRules(['color-contrast']).analyze();
  return results.violations.flatMap((violation) => violation.nodes.map((node) => node.target.join(' ')));
}

const button = (lab: Locator, key: keyof typeof vizEn) => lab.getByRole('button', { name: vizEn[key], exact: true });

/** Story mode, paused while round 1's MixColumns is in flight: one column focused, the rest dimmed. */
async function pauseMidMixColumns(page: Page): Promise<Locator> {
  const lab = await openLab(page, `${LAB_PAGE('en')}#lab=${LAB_ID}&s=${SHIFT_ROWS_STEP}&v=1`);
  await button(lab, 'ui.player.mode.story').click();
  await lab.getByLabel(vizEn['ui.player.speed']).selectOption('0.5');
  await button(lab, 'ui.player.play').click();
  await expect(lab.locator('.cv-timeline__step')).toHaveText(MIX_COLUMNS_STEP_TEXT);
  await expect(lab.locator(`${STATE_CELLS}[data-focused]`).first()).toBeAttached();
  await button(lab, 'ui.player.pause').click();
  await expect(lab.locator(`${STATE_CELLS}[data-focused]`)).toHaveCount(4);
  await expect(lab.locator(`${STATE_CELLS}[data-dimmed]`)).toHaveCount(12);
  return lab;
}

async function expandKeyWords(lab: Locator): Promise<void> {
  const toggle = lab.locator('[data-region-disclosure="w"] button');
  if ((await toggle.count()) > 0 && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

async function openKeyScheduleChain(page: Page): Promise<Locator> {
  await page.goto(KEY_SCHEDULE_PAGE);
  const lab = page.locator(`[data-lab-id="${KEY_SCHEDULE_LAB_ID}"]`);
  await lab.scrollIntoViewIfNeeded();
  await lab.getByRole('button', { name: /a0fafe17$/ }).click();
  await expect(lab.locator('.cv-keyschedule__chain')).toBeVisible();
  return lab;
}

for (const scheme of SCHEMES) {
  for (const [device, viewport] of VIEWPORTS) {
    test.describe(`${scheme} ${device}`, () => {
      test.use({ viewport, colorScheme: scheme });

      test('focus-dimmed MixColumns: every cell and label stays legible and opaque', async ({ page }) => {
        const lab = await pauseMidMixColumns(page);
        await expandKeyWords(lab);
        await expectLegible(lab, STATE_CELLS);
        await expectLegible(lab, LAB_LABELS);
        expect(await colorContrastViolations(page, LAB_ID)).toEqual([]);
        await lab.locator('[data-region="state"]').scrollIntoViewIfNeeded();
        await lab.locator('[data-region="state"]').screenshot({ path: `test-results/contrast-mixcolumns-${scheme}-${device}.png` });
      });

      test('key schedule: muted labels and the chain lines stay legible', async ({ page }) => {
        const lab = await openKeyScheduleChain(page);
        await expectLegible(lab, KEY_SCHEDULE_TEXT);
        await expectLegible(lab, LAB_LABELS);
        expect(await colorContrastViolations(page, KEY_SCHEDULE_LAB_ID)).toEqual([]);
        await lab.locator('.cv-keyschedule__chain').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `test-results/contrast-keyschedule-${scheme}-${device}.png` });
      });
    });
  }
}
