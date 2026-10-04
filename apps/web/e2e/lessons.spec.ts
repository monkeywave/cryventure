import { expect, test } from '@playwright/test';
import { interpolate } from '@cryventure/core';
import aesEn from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import aesDe from '../../../packages/primitives/src/aes/i18n/de.json' with { type: 'json' };
import { blockingViolations } from './helpers/axe.ts';
import { KEY_SCHEDULE_LAB, VIZ, WELCOME_LAB, expectStep, labButton, waitForLab, type Lang } from './labPage.ts';

interface LessonPage {
  slug: string;
  /** Short name used as link text in a group overview (e.g. "ECB"). */
  code?: string;
  title: Record<Lang, string>;
  labId?: string;
  /** Further labs on the page; each must hydrate too. */
  moreLabIds?: readonly string[];
}

const AES_LESSONS: readonly LessonPage[] = [
  { slug: 'symmetric/aes/', title: { en: 'AES at a glance', de: 'AES im Überblick' }, labId: 'aes-overview' },
  { slug: 'symmetric/aes/subbytes-sbox/', title: { en: 'SubBytes and the S-box', de: 'SubBytes und die S-Box' }, labId: 'aes-subbytes' },
  {
    slug: 'symmetric/aes/shiftrows-mixcolumns/',
    title: { en: 'ShiftRows and MixColumns', de: 'ShiftRows und MixColumns' },
    labId: 'aes-diffusion',
  },
  { slug: KEY_SCHEDULE_LAB.path, title: { en: 'Key expansion', de: 'Schlüsselexpansion' }, labId: KEY_SCHEDULE_LAB.labId },
  { slug: 'symmetric/aes/memory-and-hardware/', title: { en: 'AES in memory and hardware', de: 'AES in Speicher und Hardware' } },
  { slug: 'symmetric/aes/memory-abi/', title: { en: 'AES_KEY in memory', de: 'AES_KEY im Speicher' }, labId: 'aes-memory' },
  {
    slug: 'symmetric/aes/aes-ni/',
    title: { en: 'AES-NI and ARMv8 instructions', de: 'AES-NI- und ARMv8-Befehle' },
    labId: 'aes-ni-registers',
  },
];

/** Lessons of the "Modes" group (docs/M3.md §10); the group overview is checked separately. */
const MODE_LESSONS: readonly LessonPage[] = [
  { slug: 'symmetric/modes/ecb/', code: 'ECB', title: { en: 'ECB: the codebook mode', de: 'ECB: der Codebuch-Modus' }, labId: 'ecb-blocks' },
  { slug: 'symmetric/modes/cbc/', code: 'CBC', title: { en: 'CBC: chaining blocks', de: 'CBC: Blöcke verketten' } },
  { slug: 'symmetric/modes/ctr/', code: 'CTR', title: { en: 'CTR: a block cipher as a stream cipher', de: 'CTR: Blockchiffre als Stromchiffre' } },
  {
    slug: 'symmetric/modes/ghash/',
    code: 'GHASH',
    title: { en: 'GHASH: multiplying in GF(2¹²⁸)', de: 'GHASH: Multiplizieren in GF(2¹²⁸)' },
    labId: 'ghash-bits',
  },
  { slug: 'symmetric/modes/gcm/', code: 'GCM', title: { en: 'GCM: counter mode with a tag', de: 'GCM: Zählermodus mit Tag' }, labId: 'gcm-tc4' },
];

/** Lessons of the "Hash functions" group (docs/M5.md §7), in sidebar order. */
const HASH_LESSONS: readonly LessonPage[] = [
  { slug: 'hash/', title: { en: 'Hash functions', de: 'Hashfunktionen' }, labId: 'hash-overview' },
  { slug: 'hash/sha256/', title: { en: 'SHA-256 inside', de: 'SHA-256 von innen' }, labId: 'sha256-abc', moreLabIds: ['sha256-k', 'sha256-sha-ni'] },
  {
    slug: 'hash/sha512/',
    title: { en: 'SHA-512 and its truncated variants', de: 'SHA-512 und seine gekürzten Varianten' },
    labId: 'sha512-abc',
    moreLabIds: ['sha512-256-iv', 'sha384-iv'],
  },
];

const HASH_GROUP: Record<Lang, string> = { en: 'Hash functions', de: 'Hashfunktionen' };

const MODES_OVERVIEW = { slug: 'symmetric/modes/', title: { en: 'Modes of operation', de: 'Betriebsmodi' } } as const;

const SIX_PARTS: Record<Lang, RegExp> = {
  en: /^Part 6 · Check$/,
  de: /^Teil 6 · Selbsttest$/,
};

const AES = { en: aesEn, de: aesDe } as const;

/** Expected scope text "Round 1 · SubBytes" / "Runde 1 · SubBytes" for round 1 and `op`. */
function roundOneScope(lang: Lang, op: 'subBytes' | 'shiftRows' | 'addRoundKey'): string {
  const aes = AES[lang];
  return `${interpolate(aes['plugin.aes.scope.round'], { value: 1 })}${VIZ[lang]['ui.scope.separator']}${aes[`plugin.aes.opShort.${op}`]}`;
}

const START_POSITIONS = [
  { slug: 'symmetric/aes/subbytes-sbox/', labId: 'aes-subbytes', op: 'subBytes' },
  { slug: 'symmetric/aes/shiftrows-mixcolumns/', labId: 'aes-diffusion', op: 'shiftRows' },
  { slug: KEY_SCHEDULE_LAB.path, labId: KEY_SCHEDULE_LAB.labId, op: 'addRoundKey' },
] as const;

for (const lang of ['en', 'de'] as const) {
  for (const lesson of [...AES_LESSONS, ...MODE_LESSONS, ...HASH_LESSONS]) {
    test(`${lang}/${lesson.slug} renders all six lesson parts`, async ({ page }) => {
      const response = await page.goto(`${lang}/${lesson.slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title[lang]);
      await expect(page.locator('.cv-lesson-section')).toHaveCount(6);
      await expect(page.locator('.cv-lesson-section__eyebrow').last()).toHaveText(SIX_PARTS[lang]);
      await expect(page.locator('.cv-check')).not.toHaveCount(0);
      if (lesson.labId !== undefined) await waitForLab(page, lesson.labId);
      for (const labId of lesson.moreLabIds ?? []) await waitForLab(page, labId);
    });
  }
}

test('sidebar walks through the AES lessons in order (EN)', async ({ page }) => {
  await page.goto(`en/${WELCOME_LAB.path}`);
  const sidebar = page.locator('#starlight__sidebar');
  for (const lesson of AES_LESSONS) {
    await sidebar.getByRole('link', { name: lesson.title.en, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${lesson.slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title.en);
  }
});

for (const lang of ['en', 'de'] as const) {
  test(`${lang}/${MODES_OVERVIEW.slug} links to every mode lesson`, async ({ page }) => {
    const response = await page.goto(`${lang}/${MODES_OVERVIEW.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(MODES_OVERVIEW.title[lang]);
    for (const lesson of MODE_LESSONS) {
      const href = await page.locator('main').getByRole('link', { name: lesson.code!, exact: true }).getAttribute('href');
      expect(new URL(href!, page.url()).pathname).toMatch(new RegExp(`/${lang}/${lesson.slug}$`));
    }
  });
}

test('sidebar walks through the mode lessons in order (EN)', async ({ page }) => {
  await page.goto(`en/${MODES_OVERVIEW.slug}`);
  const sidebar = page.locator('#starlight__sidebar');
  await expect(sidebar.getByText('Modes', { exact: true })).toBeVisible();
  for (const lesson of MODE_LESSONS) {
    await sidebar.getByRole('link', { name: lesson.title.en, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${lesson.slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title.en);
  }
});

for (const lang of ['en', 'de'] as const) {
  test(`sidebar walks through the hash lessons in order (${lang.toUpperCase()})`, async ({ page }) => {
    await page.goto(`${lang}/${HASH_LESSONS[0]!.slug}`);
    const sidebar = page.locator('#starlight__sidebar');
    await expect(sidebar.locator('summary').getByText(HASH_GROUP[lang], { exact: true })).toBeVisible();
    for (const lesson of HASH_LESSONS) {
      await sidebar.getByRole('link', { name: lesson.title[lang], exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${lang}/${lesson.slug}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title[lang]);
    }
  });
}

test('German sidebar shows the translated block-cipher group', async ({ page }) => {
  await page.goto('de/symmetric/aes/');
  const sidebar = page.locator('#starlight__sidebar');
  await expect(sidebar.getByText('Blockchiffren', { exact: true })).toBeVisible();
  await sidebar.getByRole('link', { name: 'Schlüsselexpansion', exact: true }).click();
  await expect(page).toHaveURL(/\/de\/symmetric\/aes\/key-expansion\/$/);
});

test('check answers stay hidden until revealed', async ({ page }) => {
  await page.goto('en/symmetric/aes/');
  const first = page.locator('.cv-check').first();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-hydrated', 'true');
  await expect(first.getByText('Answer: B')).toBeHidden();
  await first.getByRole('button', { name: 'Show answer' }).click();
  await expect(first.getByText('Answer: B')).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('check questions keep a <details> answer', async ({ page }) => {
    await page.goto('en/symmetric/aes/');
    const first = page.locator('.cv-check').first();
    await expect(first.getByRole('radio')).toHaveCount(4);
    await expect(first.getByText('Answer: B')).toBeHidden();
    await first.getByText('Show answer').click();
    await expect(first.getByText('Answer: B')).toBeVisible();
  });
});

test('AES overview (EN) has no serious or critical axe violations', async ({ page }) => {
  await page.goto('en/symmetric/aes/');
  await waitForLab(page, 'aes-overview');
  expect(await blockingViolations(page)).toEqual([]);
});

test('S-box lesson (DE, light) has no serious or critical axe violations', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('de/symmetric/aes/subbytes-sbox/');
  await waitForLab(page, 'aes-subbytes');
  expect(await blockingViolations(page)).toEqual([]);
});

for (const lang of ['en', 'de'] as const) {
  for (const start of START_POSITIONS) {
    test(`${lang}/${start.slug} lab opens at round 1 ${start.op} (startAt)`, async ({ page }) => {
      await page.goto(`${lang}/${start.slug}`);
      const lab = await waitForLab(page, start.labId);
      await expect(lab.locator('.cv-timeline__scope')).toHaveText(roundOneScope(lang, start.op));
      await expect(page).not.toHaveURL(/#lab=/);
    });
  }
}

test('a deep-link step wins over startAt', async ({ page }) => {
  await page.goto('en/symmetric/aes/subbytes-sbox/#lab=aes-subbytes&s=0&v=1');
  const lab = await waitForLab(page, 'aes-subbytes');
  await expectStep(lab, 0);
});

test('AES overview preselects story mode without starting playback', async ({ page }) => {
  await page.goto('en/symmetric/aes/');
  const lab = await waitForLab(page, 'aes-overview');
  await expect(labButton(lab, 'ui.player.mode.story')).toHaveAttribute('aria-pressed', 'true');
  await expect(labButton(lab, 'ui.player.play')).toBeVisible();
  await page.waitForTimeout(1_500);
  await expectStep(lab, -1);
});

test('other AES labs stay in debugger mode', async ({ page }) => {
  await page.goto('en/symmetric/aes/subbytes-sbox/');
  const lab = await waitForLab(page, 'aes-subbytes');
  await expect(labButton(lab, 'ui.player.mode.debugger')).toHaveAttribute('aria-pressed', 'true');
});
