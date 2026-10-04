import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Lens } from '@cryventure/core';
import { DESKTOP, PHONE, mountLabs, seekTo, setLens, waitForLab } from './labPage.ts';

// The `sponge` view (docs/M6.md §4): every phase overlay of one Keccak-f round, the squeeze, and a
// phone without page scroll. The keccak lesson's SHA3-256("abc") lab is traced per step mapping.

const KECCAK = { path: 'en/hash/keccak/', labId: 'sha3-256-abc' } as const;
const SPONGE_LESSON = { path: 'en/hash/sponge/', labId: 'sha3-256-abc-permutation' } as const;
/** Trace steps of SHA3-256("abc") at `mapping` detail: pad, absorb, then θ ρ π χ ι per round, squeeze, output. */
const STEP = { absorb: 1, theta: 2, rho: 3, pi: 4, chi: 5, iota: 6, squeeze: 122, output: 123 } as const;
/** SHA3-256: rate 1088 bits = 17 lanes, capacity 512 bits = 8 lanes. */
const RATE_LANES = 17;
const CAPACITY_LANES = 8;
/** FIPS 202 A.1, SHA3-256("abc"), as the output groups of the first four rate lanes. */
const DIGEST_GROUPS = ['3a 98 5d a7 4f e2 25 b2', '04 5c 17 2d 6b d3 90 bd', '85 5f 08 6e 3e 9d 52 5b', '46 bf e2 45 11 43 15 32'];
const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];

const sponge = (lab: Locator) => lab.locator('.cv-sponge');
const lane = (lab: Locator, x: number, y: number) => sponge(lab).locator(`.cv-sponge__lane[data-col="${x}"][data-row="${y}"]`);
const badges = (lab: Locator, kind: string) => sponge(lab).locator(`.cv-sponge__badge[data-badge="${kind}"]`);
const parity = (lab: Locator, row: 'c' | 'd') => sponge(lab).locator(`.cv-sponge__thetarow[data-row="${row}"] .cv-sponge__parity`);
const parityMarks = (lab: Locator) => parity(lab, 'c').evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-mark')));

async function openKeccakAt(page: Page, step: number): Promise<Locator> {
  await page.goto(KECCAK.path);
  await setLens(page, 'engineer');
  const lab = await waitForLab(page, KECCAK.labId);
  await expect(sponge(lab)).toBeVisible();
  await seekTo(lab, step);
  return lab;
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

test.describe('sponge view phases (desktop)', () => {
  test.use({ viewport: DESKTOP });

  test('absorb: "⊕ block" on the 17 rate lanes only; the 8 capacity lanes stay hatched', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.absorb);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'absorb');
    await expect(sponge(lab).locator('.cv-sponge__lane[data-part="rate"]')).toHaveCount(RATE_LANES);
    await expect(sponge(lab).locator('.cv-sponge__lane[data-part="capacity"]')).toHaveCount(CAPACITY_LANES);
    await expect(badges(lab, 'absorb')).toHaveCount(RATE_LANES);
    await expect(sponge(lab).locator('.cv-sponge__lane[data-part="capacity"] .cv-sponge__badge')).toHaveCount(0);
  });

  test('θ: C and D rows under the grid, columns x−1 and x+1 marked for the selected column', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.theta);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'theta');
    await expect(parity(lab, 'c')).toHaveCount(5);
    await expect(parity(lab, 'd')).toHaveCount(5);
    // Column 0 is selected first: its neighbours are x = 4 (left) and x = 1 (right).
    await expect(sponge(lab).locator('.cv-sponge__lane[data-in-column]')).toHaveCount(5);
    expect(await parityMarks(lab)).toEqual(['selected', 'right', null, null, 'left']);
    await lane(lab, 2, 3).hover();
    await expect.poll(() => parityMarks(lab)).toEqual([null, 'left', 'selected', 'right', null]);
    await expect(sponge(lab).locator('.cv-sponge__lane[data-in-column][data-col="2"]')).toHaveCount(5);
  });

  test('θ: the keyboard-focused lane keeps a solid 3px focus ring inside the dashed column marking', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.theta);
    await lane(lab, 0, 0).focus();
    await page.keyboard.press('ArrowRight');
    const focused = lane(lab, 1, 0);
    await expect(focused).toBeFocused();
    await expect(focused).toHaveAttribute('data-in-column', 'true');
    await expect(focused).toHaveCSS('outline-style', 'solid');
    await expect(focused).toHaveCSS('outline-width', '3px');
    await expect(lane(lab, 1, 1)).toHaveCSS('outline-style', 'dashed'); // the rest of the column stays dashed
  });

  test('story lens: a zero rate lane keeps the rate tint of the legend swatch (unlike a zero capacity lane)', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.absorb);
    await setLens(page, 'story');
    await expect(sponge(lab)).toHaveAttribute('data-lens', 'story');
    const background = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    const rateKey = await background(sponge(lab).locator('.cv-sponge__key[data-part="rate"]'));
    // After absorbing "abc", lane (1, 0) is a rate lane with value 0 and lane (2, 3) a zero capacity lane.
    await expect.poll(() => background(lane(lab, 1, 0))).toBe(rateKey);
    expect(await background(lane(lab, 2, 3))).not.toBe(rateKey);
  });

  test('ρ: an offset badge on every lane (FIPS 202 Table 2: (1,0) ≪ 1, (0,1) ≪ 36)', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.rho);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'rho');
    await expect(badges(lab, 'rho')).toHaveCount(25);
    await expect(lane(lab, 1, 0).locator('[data-badge="rho"]')).toHaveText('≪ 1');
    await expect(lane(lab, 0, 1).locator('[data-badge="rho"]')).toHaveText('≪ 36');
  });

  test('π: arrows on a wide panel, the "← (x, y)" labels hidden', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.pi);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'pi');
    await expect(sponge(lab).locator('.cv-sponge__arrows')).toBeVisible();
    await expect(sponge(lab).locator('.cv-sponge__arrow')).toHaveCount(24); // lane (0,0) stays put
    await expect(badges(lab, 'pi').first()).toBeHidden();
  });

  test('π: the arrows run beneath the lane content, never over a lane’s hex', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.pi);
    await expect(sponge(lab).locator('.cv-sponge__arrows')).toBeVisible();
    const arrowOverHex = await sponge(lab).evaluate((root) => {
      const svg = root.querySelector<SVGSVGElement>('.cv-sponge__arrows')!;
      const hexLines = [...root.querySelectorAll('.cv-sponge__hexline')].map((line) => line.getBoundingClientRect());
      const box = svg.getBoundingClientRect();
      const at = (value: string, size: number, start: number) => start + (parseFloat(value) / 100) * size;
      svg.style.pointerEvents = 'auto'; // hit-test the arrows to learn what is painted on top
      const found: string[] = [];
      for (const line of svg.querySelectorAll('line')) {
        const [x1, y1, x2, y2] = [at(line.getAttribute('x1')!, box.width, box.left), at(line.getAttribute('y1')!, box.height, box.top), at(line.getAttribute('x2')!, box.width, box.left), at(line.getAttribute('y2')!, box.height, box.top)];
        for (let t = 0; t <= 1; t += 0.01) {
          const [x, y] = [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
          const overHex = hexLines.some((rect) => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom);
          if (overHex && svg.contains(document.elementFromPoint(x, y))) found.push(`${Math.round(x)},${Math.round(y)}`);
        }
      }
      svg.style.pointerEvents = '';
      return found;
    });
    expect(arrowOverHex).toEqual([]);
  });

  test('χ: the selected row carries a, b, c; ι: lane (0,0) ⊕ RC', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.chi);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'chi');
    await expect(sponge(lab).locator('.cv-sponge__lane[data-in-row]')).toHaveCount(5);
    await expect(lane(lab, 0, 0).locator('[data-badge="chi.a"]')).toHaveText('a');
    await expect(lane(lab, 1, 0).locator('[data-badge="chi.b"]')).toHaveText('b');
    await expect(lane(lab, 2, 0).locator('[data-badge="chi.c"]')).toHaveText('c');
    await expect(sponge(lab).locator('.cv-sponge__values dt')).toHaveCount(5); // a, b, c, ¬b ∧ c, result

    await seekTo(lab, STEP.iota);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'iota');
    await expect(badges(lab, 'iota')).toHaveCount(1);
    await expect(lane(lab, 0, 0).locator('[data-badge="iota"]')).toHaveText('⊕ RC');
  });

  test('squeeze/output: rate lanes flow into the output; the bytes are FIPS 202’s SHA3-256("abc")', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.squeeze);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'squeeze');
    await expect(badges(lab, 'output')).toHaveCount(RATE_LANES);
    await seekTo(lab, STEP.output);
    await expect(sponge(lab)).toHaveAttribute('data-phase', 'output');
    await expect(sponge(lab).locator('.cv-sponge__group .cv-sponge__bytes')).toHaveText(DIGEST_GROUPS);
  });

  test('the cryptographer lens adds the mapping formula; the story lens drops the hex', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.theta);
    await expect(sponge(lab).locator('.cv-sponge__formula')).toHaveCount(0);
    await setLens(page, 'cryptographer');
    await expect(sponge(lab).locator('.cv-sponge__formula')).toBeVisible();
    await setLens(page, 'story');
    await expect(sponge(lab).locator('.cv-sponge__lane .cv-sponge__hex')).toHaveCount(0);
  });

  test('the sponge lesson’s per-permutation lab walks absorb → permutation → squeeze → output', async ({ page }) => {
    await page.goto(SPONGE_LESSON.path);
    const lab = await waitForLab(page, SPONGE_LESSON.labId);
    await expect(sponge(lab)).toBeVisible(); // the view is a lazy chunk: wait for it before seeking
    const phases = { 1: 'absorb', 2: 'permute', 3: 'squeeze', 4: 'output' } as const;
    for (const [step, phase] of Object.entries(phases)) {
      await seekTo(lab, Number(step));
      await expect(sponge(lab)).toHaveAttribute('data-phase', phase);
    }
  });
});

test.describe('sponge view on a 390px phone', () => {
  test.use({ viewport: PHONE });

  test('π shows "← (x, y)" labels instead of arrows: lane (0,1) comes from (3,0)', async ({ page }) => {
    const lab = await openKeccakAt(page, STEP.pi);
    await expect(sponge(lab).locator('.cv-sponge__arrows')).toBeHidden();
    await expect(lane(lab, 0, 1).locator('[data-badge="pi"]')).toBeVisible();
    await expect(lane(lab, 0, 1).locator('[data-badge="pi"]')).toHaveText('← (3, 0)');
  });

  for (const lens of LENSES) {
    test(`no page scroll sideways through every phase (${lens} lens)`, async ({ page }) => {
      test.slow();
      const lab = await openKeccakAt(page, STEP.absorb);
      await setLens(page, lens);
      for (const step of Object.values(STEP)) {
        await seekTo(lab, step);
        await expect(sponge(lab)).toBeVisible();
        expect(await pageOverflow(page), `step ${step}`).toBe(0);
      }
    });
  }

  test('the sponge lesson never scrolls the page sideways with every lab mounted', async ({ page }) => {
    await page.goto(SPONGE_LESSON.path);
    await mountLabs(page);
    expect(await pageOverflow(page)).toBe(0);
  });
});
