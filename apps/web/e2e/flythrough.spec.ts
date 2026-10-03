import { expect, test, type Locator, type Page } from '@playwright/test';
import flyEn from '../src/i18n/en/flyThrough.json' with { type: 'json' };
import flyDe from '../src/i18n/de/flyThrough.json' with { type: 'json' };
import { DESKTOP, PHONE, expectNoHorizontalOverflow, type Lang } from './labPage.ts';

/**
 * `<FlyThrough />` (docs/M4.md §8) lives in the `symmetric/aes/memory-abi` lesson. Override the page
 * with FLYTHROUGH_PATH (e.g. a local preview page) while that lesson does not exist yet.
 */
const FLYTHROUGH_PATH = process.env.FLYTHROUGH_PATH ?? 'symmetric/aes/memory-abi/';
const FLY: Record<Lang, typeof flyEn> = { en: flyEn, de: flyDe };

async function openFlyThrough(page: Page, lang: Lang = 'en'): Promise<Locator> {
  await page.goto(`${lang}/${FLYTHROUGH_PATH}`);
  const fly = page.locator('.cv-fly');
  await fly.scrollIntoViewIfNeeded();
  await expect(fly).toHaveAttribute('data-hydrated', 'true');
  return fly;
}

const button = (fly: Locator, key: 'ui.flyThrough.back' | 'ui.flyThrough.step' | 'ui.flyThrough.play' | 'ui.flyThrough.pause', lang: Lang = 'en') =>
  fly.getByRole('button', { name: FLY[lang][key], exact: true });
const caption = (fly: Locator) => fly.locator('.cv-fly__caption');
/** Byte `index` of the visible (not fading-out) layer. */
const byteToken = (fly: Locator, index: number) => fly.locator(`.cv-fly__tokens:not(.cv-fly__tokens--out) [data-byte="${index}"]`);
/** Horizontal distance (px) between byte `index` and RAM slot `offset`; the stroke makes it differ by up to ~1 px. */
async function distanceToRamSlot(fly: Locator, index: number, offset: number): Promise<number> {
  const slot = await fly.locator('.cv-fly__slot').nth(32 + offset).boundingBox();
  const token = await byteToken(fly, index).boundingBox();
  return Math.abs((token?.x ?? Infinity) - (slot?.x ?? 0));
}

test.describe('FlyThrough', () => {
  test('steps matrix → xmm0 → RAM and back, without autoplay', async ({ page }) => {
    const fly = await openFlyThrough(page);
    await expect(fly).toHaveAttribute('data-beat', 'matrix');
    await expect(caption(fly)).toHaveText(flyEn['ui.flyThrough.caption.matrix.rd_key']);
    await expect(caption(fly)).toHaveAttribute('aria-live', 'polite');
    await page.waitForTimeout(2_000);
    await expect(fly).toHaveAttribute('data-beat', 'matrix');

    await button(fly, 'ui.flyThrough.step').click();
    await expect(fly).toHaveAttribute('data-beat', 'register');
    await expect(caption(fly)).toHaveText(flyEn['ui.flyThrough.caption.register.c-ref']);
    await button(fly, 'ui.flyThrough.step').click();
    await expect(fly).toHaveAttribute('data-beat', 'memory');
    await expect(caption(fly)).toHaveText(flyEn['ui.flyThrough.caption.memory.rd_key.c-ref']);
    await expect(button(fly, 'ui.flyThrough.step')).toBeDisabled();
    await button(fly, 'ui.flyThrough.back').click();
    await expect(fly).toHaveAttribute('data-beat', 'register');
  });

  test('the impl toggle reverses the rd_key words only for the C reference', async ({ page }) => {
    const fly = await openFlyThrough(page);
    await button(fly, 'ui.flyThrough.step').click();
    await button(fly, 'ui.flyThrough.step').click();
    // Matrix and xmm0 slots come first (16 each). Byte 0 (00) sits at RAM offset +3 in the C reference ...
    await expect.poll(() => distanceToRamSlot(fly, 0, 3)).toBeLessThan(3);
    // ... and at +0 with AES-NI.
    await fly.getByRole('radio', { name: flyEn['ui.flyThrough.impl.aesni'] }).check();
    await expect(fly).toHaveAttribute('data-impl', 'aesni');
    await expect(caption(fly)).toHaveText(flyEn['ui.flyThrough.caption.memory.rd_key.aesni']);
    await expect.poll(() => distanceToRamSlot(fly, 0, 0)).toBeLessThan(3);

    await fly.getByRole('radio', { name: flyEn['ui.flyThrough.target.out'] }).check();
    await expect(caption(fly)).toHaveText(flyEn['ui.flyThrough.caption.memory.out']);
    // out[16] receives the C.1 ciphertext, not the plaintext.
    await expect(byteToken(fly, 0)).toHaveText('69');
    await expect(byteToken(fly, 15)).toHaveText('5a');
  });

  test('Play walks through the beats and stops at RAM', async ({ page }) => {
    const fly = await openFlyThrough(page);
    await button(fly, 'ui.flyThrough.play').click();
    await expect(button(fly, 'ui.flyThrough.pause')).not.toHaveAttribute('aria-pressed');
    // Playback does not announce every beat; the caption speaks again once it stops.
    await expect(caption(fly)).toHaveAttribute('aria-live', 'off');
    await expect(fly).toHaveAttribute('data-beat', 'register', { timeout: 5_000 });
    await expect(fly).toHaveAttribute('data-beat', 'memory', { timeout: 5_000 });
    await expect(button(fly, 'ui.flyThrough.play')).toBeVisible({ timeout: 5_000 });
    await expect(caption(fly)).toHaveAttribute('aria-live', 'polite');
    await expect(fly.locator('.cv-fly__beat')).toHaveText('Step 3 of 3');
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('cross-fades the same beats', async ({ page }) => {
      const fly = await openFlyThrough(page);
      await expect(fly).toHaveAttribute('data-motion', 'reduce');
      await button(fly, 'ui.flyThrough.step').click();
      await expect(fly).toHaveAttribute('data-beat', 'register');
      await expect(fly.locator('.cv-fly__tokens--in')).toHaveCount(1);
      await expect(fly.locator('.cv-fly__tokens--out')).toHaveCount(1);
    });
  });

  test('German captions and a 390 px phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    const fly = await openFlyThrough(page, 'de');
    await button(fly, 'ui.flyThrough.step', 'de').click();
    await expect(caption(fly)).toHaveText(flyDe['ui.flyThrough.caption.register.c-ref']);
    await expect(fly.locator('.cv-fly__beat')).toHaveText('Schritt 2 von 3');
    await expectNoHorizontalOverflow(page);
    await expect(fly.locator('.cv-fly__svg')).toHaveAttribute('data-layout', 'narrow');
    // Every SVG text renders at 11 px or more; titles, lane numbers and offsets stay inside the drawing
    // (byte tokens are checked by size only, since they may still be gliding).
    const texts = await fly.locator('.cv-fly__svg').evaluate((svg: SVGSVGElement) => {
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const box = svg.getBoundingClientRect();
      return Array.from(svg.querySelectorAll('text'), (text) => {
        const rect = text.getBoundingClientRect();
        const inside = text.closest('.cv-fly__byte') !== null || (rect.left >= box.left - 1 && rect.right <= box.right + 1);
        return { text: text.textContent, px: parseFloat(getComputedStyle(text).fontSize) * scale, inside };
      });
    });
    expect(texts.filter(({ px }) => px < 11)).toEqual([]);
    expect(texts.filter(({ inside }) => !inside)).toEqual([]);
  });
});

test.describe('FlyThrough screenshots', () => {
  for (const lang of ['en', 'de'] as const)
    for (const scheme of ['light', 'dark'] as const)
      for (const [size, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const)
        test(`${lang} ${scheme} ${size}`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
          const fly = await openFlyThrough(page, lang);
          await button(fly, 'ui.flyThrough.step', lang).click();
          await button(fly, 'ui.flyThrough.step', lang).click();
          await expect(fly).toHaveAttribute('data-beat', 'memory');
          await page.waitForTimeout(500);
          await fly.screenshot({ path: `test-results/screens/flythrough-${lang}-${scheme}-${size}.png` });
        });
});
