import { expect, test, type Locator } from '@playwright/test';
import { interpolate, type Lens } from '@cryventure/core';
import constantsEn from '../../../packages/primitives/src/sha2-constants/i18n/en.json' with { type: 'json' };
import constantsDe from '../../../packages/primitives/src/sha2-constants/i18n/de.json' with { type: 'json' };
import { blockingViolations } from './helpers/axe.ts';
import { labButton, mountLabs, seekTo, setLens, stepCount, waitForLab, type Lang } from './labPage.ts';

// Hash lessons (docs/M5.md §4, §5, §7): the `wordops` view, the SHA labs and the derived SHA views.

const SHA256 = { path: 'hash/sha256/', round: 'sha256-abc', constants: 'sha256-k', hardware: 'sha256-sha-ni' } as const;
const SHA512 = { path: 'hash/sha512/', round: 'sha512-abc', ivConstants: 'sha384-iv' } as const;
const HASH_PAGES = ['hash/', SHA256.path, SHA512.path] as const;
const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];
const CONSTANTS = { en: constantsEn, de: constantsDe } as const;

/** NIST SHA256.pdf ("abc"), t = 0: the registers before and after, and T1/T2. */
const ROUND_0 = {
  before: { a: '6a09 e667', e: '510e 527f' },
  after: { a: '5d6a ebcd', b: '6a09 e667', e: 'fa2a 4622' },
  T1: '54da 50e8',
  T2: '0890 9ae5',
} as const;
/** The nine round terms in dataflow order (`roundTerms`); the story lens keeps T1 and T2 only. */
const ROUND_TERMS = ['Sigma1', 'ch', 'k', 'w', 'kw', 'T1', 'Sigma0', 'maj', 'T2'];
const STORY_TERMS = ['T1', 'T2'];

/** SHA-NI keeps A, B, E, F in one XMM register, A in the highest dword: the SHA-256 IV in memory order. */
const IV_ABEF_MEMORY_ORDER = '8c68059b7f520e5185ae67bb67e6096a';
const X86_VARIANT = 'x86_64-sha-ni';
const ARM_VARIANT = 'aarch64-armv8-sha2';

const wordops = (lab: Locator) => lab.locator('.cv-wordops');
const register = (lab: Locator, side: 'before' | 'after', name: string) =>
  wordops(lab).locator(`[data-side="${side}"] [data-register="${name}"] .cv-wordops__word`);
const term = (lab: Locator, id: string) => wordops(lab).locator(`[data-term="${id}"] .cv-wordops__hex`);
const termIds = (lab: Locator) => wordops(lab).locator('[data-term]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-term')));

/** Each register of the registers view as one hex string, its bytes in the shown (memory) order. */
const registerRows = (lab: Locator) =>
  lab
    .locator('.cv-registers .cv-grid__row:not(.cv-grid__head)')
    .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('.cv-cell')].map((cell) => cell.textContent?.trim() ?? '').join('')));

test.describe('SHA-256 round lab (wordops)', () => {
  test('opens at round 0 with the register row, the shift arrows and NIST’s T1/T2', async ({ page }) => {
    await page.goto(`en/${SHA256.path}`);
    const lab = await waitForLab(page, SHA256.round);
    await expect(wordops(lab)).toBeVisible();
    await expect(wordops(lab).locator('[data-upcoming]')).toHaveCount(0);
    await expect(register(lab, 'before', 'a')).toHaveText(ROUND_0.before.a);
    await expect(register(lab, 'before', 'e')).toHaveText(ROUND_0.before.e);
    await expect(register(lab, 'after', 'a')).toHaveText(ROUND_0.after.a);
    await expect(register(lab, 'after', 'b')).toHaveText(ROUND_0.after.b);
    await expect(register(lab, 'after', 'e')).toHaveText(ROUND_0.after.e);
    await expect(wordops(lab).locator('.cv-wordops__registers[data-shift]')).toBeVisible();
    await expect(term(lab, 'T1')).toHaveText(ROUND_0.T1);
    await expect(term(lab, 'T2')).toHaveText(ROUND_0.T2);
  });

  test('stepping to round 1 changes the registers and T1/T2; round 0’s after row becomes round 1’s before row', async ({ page }) => {
    await page.goto(`en/${SHA256.path}`);
    const lab = await waitForLab(page, SHA256.round);
    await expect(term(lab, 'T1')).toHaveText(ROUND_0.T1);
    await labButton(lab, 'ui.player.next').click();
    await expect(term(lab, 'T1')).not.toHaveText(ROUND_0.T1);
    await expect(term(lab, 'T2')).not.toHaveText(ROUND_0.T2);
    await expect(register(lab, 'before', 'a')).toHaveText(ROUND_0.after.a);
    await expect(register(lab, 'before', 'e')).toHaveText(ROUND_0.after.e);
    await expect(register(lab, 'after', 'b')).toHaveText(ROUND_0.after.a);
  });

  test('the lens decides the parts: story = T1/T2, engineer = all terms + bit strips, cryptographer = formula + all terms', async ({ page }) => {
    await page.goto(`en/${SHA256.path}`);
    const lab = await waitForLab(page, SHA256.round);
    const formula = wordops(lab).locator('.cv-wordops__formula');
    const bitStrips = wordops(lab).locator('.cv-wordops__bits');

    await setLens(page, 'story');
    await expect(lab).toHaveAttribute('data-lens', 'story');
    await expect.poll(() => termIds(lab)).toEqual(STORY_TERMS);
    await expect(formula).toHaveCount(0);
    await expect(bitStrips).toHaveCount(0);
    await expect(register(lab, 'after', 'a')).toHaveText(ROUND_0.after.a);

    await setLens(page, 'engineer');
    await expect(lab).toHaveAttribute('data-lens', 'engineer');
    await expect.poll(() => termIds(lab)).toEqual(ROUND_TERMS);
    await expect(formula).toHaveCount(0);
    await expect(bitStrips).toHaveCount(2); // Σ1(e) and Σ0(a): the rotation mixes of a round

    await setLens(page, 'cryptographer');
    await expect(lab).toHaveAttribute('data-lens', 'cryptographer');
    await expect.poll(() => termIds(lab)).toEqual(ROUND_TERMS);
    await expect(formula).toBeVisible();
    await expect(bitStrips).toHaveCount(0);
  });
});

test('SHA-512 round lab shows 64-bit words as hex only, even in the engineer lens', async ({ page }) => {
  await page.goto(`en/${SHA512.path}`);
  const lab = await waitForLab(page, SHA512.round);
  await setLens(page, 'engineer');
  await expect(wordops(lab)).toHaveAttribute('data-bits', '64');
  await expect(term(lab, 'T1')).toHaveText(/^([0-9a-f]{4} ){3}[0-9a-f]{4}$/);
  await expect(wordops(lab).locator('.cv-wordops__bits')).toHaveCount(0);
});

for (const lang of ['en', 'de'] as const satisfies readonly Lang[]) {
  test(`sha2-constants lab (${lang}): the compare step confirms all 64 K words match FIPS 180-4`, async ({ page }) => {
    await page.goto(`${lang}/${SHA256.path}`);
    const lab = await waitForLab(page, SHA256.constants);
    await seekTo(lab, (await stepCount(lab)) - 1, lang);
    await expect(lab.locator('.cv-narration')).toHaveText(
      interpolate(CONSTANTS[lang]['plugin.sha2-constants.step.compareMatch'], { count: 64, section: '§4.2.2' }),
    );
  });
}

test('sha2-constants lab for the SHA-384 IV matches FIPS 180-4 §5.3.4', async ({ page }) => {
  await page.goto(`en/${SHA512.path}`);
  const lab = await waitForLab(page, SHA512.ivConstants);
  await seekTo(lab, (await stepCount(lab)) - 1);
  await expect(lab.locator('.cv-narration')).toHaveText(
    interpolate(constantsEn['plugin.sha2-constants.step.compareMatch'], { count: 8, section: '§5.3.4' }),
  );
});

test.describe('derived SHA views (hardware lab)', () => {
  test('x86-64 SHA-NI: the listing has sha256rnds2 and a register holds A, B, E, F of the IV', async ({ page }) => {
    await page.goto(`en/${SHA256.path}`);
    const lab = await waitForLab(page, SHA256.hardware);
    const instructions = lab.locator('.cv-instructions');
    await expect(instructions).toContainText(/sha256rnds2/i);
    await expect(instructions.locator('select')).toHaveValue(X86_VARIANT);
    await expect(lab.locator('.cv-registers')).toBeVisible();
    await expect.poll(() => registerRows(lab)).toContain(IV_ABEF_MEMORY_ORDER);
  });

  test('the variant picker offers AArch64 ARMv8 SHA2 and switches the listing', async ({ page }) => {
    await page.goto(`en/${SHA256.path}`);
    const lab = await waitForLab(page, SHA256.hardware);
    const picker = lab.locator('.cv-instructions select');
    await expect(picker.locator(`option[value="${ARM_VARIANT}"]`)).toHaveCount(1);
    await picker.selectOption(ARM_VARIANT);
    await expect(lab.locator('.cv-instructions')).toContainText(/sha256h2?\b/i);
    await expect(lab.locator('.cv-instructions')).not.toContainText(/sha256rnds2/i);
    await expect(lab.locator('.cv-registers select')).toHaveValue(ARM_VARIANT);
  });
});

/**
 * Axe, kept cheap: the SHA-256 page (the richest: wordops, constants, hardware listing) once per lens,
 * the overview and SHA-512 pages once, all light; plus one German dark-mode run.
 */
const AXE_RUNS: readonly { lang: Lang; path: string; lens: Lens; colorScheme: 'light' | 'dark' }[] = [
  ...LENSES.map((lens) => ({ lang: 'en' as const, path: SHA256.path, lens, colorScheme: 'light' as const })),
  { lang: 'en', path: HASH_PAGES[0], lens: 'story', colorScheme: 'light' },
  { lang: 'en', path: SHA512.path, lens: 'engineer', colorScheme: 'light' },
  { lang: 'de', path: SHA256.path, lens: 'cryptographer', colorScheme: 'dark' },
];

for (const { lang, path, lens, colorScheme } of AXE_RUNS) {
  test(`${lang}/${path} has no serious or critical axe violations (${lens} lens, ${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`${lang}/${path}`);
    await setLens(page, lens);
    await mountLabs(page);
    expect(await blockingViolations(page)).toEqual([]);
  });
}
