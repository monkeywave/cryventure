import { expect, test, type Locator, type Page } from '@playwright/test';
import { DESKTOP, KEY_SCHEDULE_LAB, PHONE, openLab } from './labPage.ts';

/** Labs whose state column holds many words (the SHA message schedule, the K constants) beside a wordops panel. */
const WORD_LABS = [
  { path: 'hash/sha256/', labId: 'sha256-abc' },
  { path: 'hash/sha512/', labId: 'sha512-abc' },
  { path: 'hash/sha256/', labId: 'sha256-k' },
] as const;
const ROUND_LABS = WORD_LABS.slice(0, 2);
/** A SHA-256 round step deep in the schedule (round 20 of block 1: W20 is current). */
const SHA256_LATE_ROUND_STEP = 60;
/** Bound on the side-by-side panels' height (uncapped, the 64/80 schedule words stretched them to 3,000–3,500px). */
const MAX_WORKSPACE_HEIGHT = 1800;

/** Word labs have no `state` region: wait for a cell of any region. */
const openWordLab = (page: Page, path: string, labId: string, hash?: string): Promise<Locator> => openLab(page, { path, labId, hash, region: null });

/** State grids whose cells reach past their panel's edge without being a scroller themselves. */
const clippedGrids = (lab: Locator) =>
  lab.locator('.cv-workspace__panel').evaluateAll((panels) =>
    panels.flatMap((panel) =>
      [...panel.querySelectorAll<HTMLElement>('[data-region] .cv-grid')]
        .filter((grid) => {
          const overflows = grid.scrollWidth > grid.clientWidth + 1;
          const scrolls = ['auto', 'scroll'].includes(getComputedStyle(grid).overflowX);
          const beyondPanel = grid.getBoundingClientRect().right > panel.getBoundingClientRect().right + 1;
          return beyondPanel || (overflows && !(scrolls && grid.hasAttribute('data-overflow-end')));
        })
        .map((grid) => grid.getAttribute('aria-label')),
    ),
  );

test.describe('desktop layout of word-heavy labs', () => {
  test.use({ viewport: DESKTOP });

  for (const { path, labId } of WORD_LABS) {
    test(`${labId}: no state grid is cut off without a scroll affordance`, async ({ page }) => {
      const lab = await openWordLab(page, path, labId);
      expect(await clippedGrids(lab)).toEqual([]);
    });

    test(`${labId}: long word regions scroll inside a capped height, so the panels stay short`, async ({ page }) => {
      const lab = await openWordLab(page, path, labId);
      const workspace = lab.locator('.cv-workspace');
      const height = await workspace.evaluate((element) => element.getBoundingClientRect().height);
      expect(height).toBeLessThanOrEqual(MAX_WORKSPACE_HEIGHT);
      const capped = lab.locator('.cv-region-disclosure .cv-grid[data-overflow-bottom]');
      await expect(capped.first()).toBeVisible();
    });
  }

  test('the current schedule word scrolls into view inside its capped region', async ({ page }) => {
    const lab = await openWordLab(page, 'hash/sha256/', 'sha256-abc', `#lab=sha256-abc&s=${SHA256_LATE_ROUND_STEP}&v=1`);
    const grid = lab.locator('[data-region="w"] .cv-grid');
    const current = grid.locator(':scope > .cv-grid__row[data-current]').first();
    await expect(current).toBeAttached();
    await expect
      .poll(() =>
        current.evaluate((row) => {
          const scroller = row.parentElement?.getBoundingClientRect();
          const box = row.getBoundingClientRect();
          return scroller !== undefined && box.top >= scroller.top - 1 && box.bottom <= scroller.bottom + 1;
        }),
      )
      .toBe(true);
    expect(await grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  });
});

/** The lab host's own bottom margin (1.5rem) plus the footer's top margin (1.5rem), with some slack. */
const MAX_GAP_BELOW_LAB = 64;

test.describe('phone layout', () => {
  test.use({ viewport: PHONE });

  test('no blank gap between a closing lab and the page pagination', async ({ page }) => {
    const lab = await openLab(page);
    const labBottom = await lab.evaluate((element) => element.getBoundingClientRect().bottom + window.scrollY);
    const pagination = page.locator('.pagination-links');
    const paginationTop = await pagination.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    expect(paginationTop - labBottom).toBeLessThanOrEqual(MAX_GAP_BELOW_LAB);
  });

  test('scrollable formulas are keyboard-focusable regions named by their caption', async ({ page }) => {
    await page.goto(`de/${KEY_SCHEDULE_LAB.path}`);
    const bodies = page.locator('.cv-formula__body');
    expect(await bodies.count()).toBeGreaterThan(0);
    for (const body of await bodies.all()) {
      await expect(body).toHaveAttribute('tabindex', '0');
      const captionId = await body.getAttribute('aria-labelledby');
      if (captionId === null) continue;
      await expect(body).toHaveAttribute('role', 'region');
      await expect(page.locator(`[id="${captionId}"]`)).toHaveText(/\S/);
    }
    await bodies.first().focus();
    await expect(bodies.first()).toBeFocused();
  });

  for (const { path, labId } of ROUND_LABS) {
    test(`${labId}: stacked panels follow the layout preset, so the wordops panel comes first`, async ({ page }) => {
      const lab = await openWordLab(page, path, labId);
      const panelIds = await lab.locator('.cv-workspace__panel--stacked').evaluateAll((panels) => panels.map((panel) => panel.getAttribute('data-panel-id')));
      expect(panelIds[0]).toBe('wordops');
    });
  }
});
