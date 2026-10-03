import { expect, test, type Locator, type Page } from '@playwright/test';
import penguinEn from '../src/i18n/en/penguin.json' with { type: 'json' };
import penguinDe from '../src/i18n/de/penguin.json' with { type: 'json' };
import { countRepeatedBlocks } from '../src/islands/penguin/pixels.ts';
import { blockingViolations } from './helpers/axe.ts';
import { PHONE, expectNoHorizontalOverflow } from './labPage.ts';

/** The ECB lesson embeds `<PenguinLab />` in its "break" part (docs/M3.md §9, §10). */
const ECB_LESSON = 'symmetric/modes/ecb/';
const BLOCK = 16;

async function openPenguinLab(page: Page, lang: 'en' | 'de' = 'en'): Promise<Locator> {
  await page.goto(`${lang}/${ECB_LESSON}`);
  // The island hydrates `client:visible`, so scroll it into view before waiting for hydration.
  const lab = page.locator('.cv-penguin');
  await lab.scrollIntoViewIfNeeded();
  await expect(lab).toHaveAttribute('data-hydrated', 'true');
  // The original canvas is filled once the penguin SVG is rasterised.
  await expect(lab.getByTestId('penguin-original')).toHaveAttribute('aria-label', /penguin|Pinguin/);
  return lab;
}

async function encrypt(lab: Locator, mode: 'ECB' | 'CBC', messages = penguinEn): Promise<void> {
  await lab.getByRole('radio', { name: mode }).check();
  await lab.getByRole('button', { name: messages['ui.penguin.encrypt'] }).click();
  await expect(lab.getByTestId('penguin-encrypted')).toHaveAttribute('data-mode', mode.toLowerCase());
}

/** Reads the encrypted canvas back as RGB bytes and counts 16-byte blocks equal to an earlier one. */
async function encryptedStats(lab: Locator): Promise<{ repeated: number; total: number; nonBlack: number }> {
  const rgb = await lab.getByTestId('penguin-encrypted').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(rgba.filter((_, index) => index % 4 !== 3));
  });
  return { ...countRepeatedBlocks(Uint8Array.from(rgb), BLOCK), nonBlack: rgb.filter((byte) => byte !== 0).length };
}

test.describe('PenguinLab', () => {
  test('ECB leaks repeated blocks; CBC does not', async ({ page }) => {
    const lab = await openPenguinLab(page);
    await encrypt(lab, 'ECB');
    const ecb = await encryptedStats(lab);
    expect(ecb.total).toBeGreaterThan(0);
    expect(ecb.nonBlack).toBeGreaterThan(0);
    expect(ecb.repeated).toBeGreaterThan(ecb.total / 2);
    await expect(lab.getByRole('status')).toContainText(`AES-ECB: ${ecb.repeated} of`);

    await encrypt(lab, 'CBC');
    const cbc = await encryptedStats(lab);
    expect(cbc.nonBlack).toBeGreaterThan(0);
    expect(cbc.repeated).toBe(0);
    await expect(lab.getByRole('status')).toContainText('AES-CBC: 0 of');
  });

  test('rejects an invalid key without encrypting', async ({ page }) => {
    const lab = await openPenguinLab(page);
    const key = lab.getByLabel(penguinEn['ui.penguin.key.label']);
    await key.fill('00ff');
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    await lab.getByRole('button', { name: penguinEn['ui.penguin.encrypt'] }).click();
    await expect(key).toBeFocused();
    await expect(lab.getByTestId('penguin-encrypted')).toBeHidden();
  });

  test('German UI, phone layout stacks the images, no serious axe violations', async ({ page }) => {
    await page.setViewportSize(PHONE);
    const lab = await openPenguinLab(page, 'de');
    await encrypt(lab, 'ECB', penguinDe);
    const [original, encrypted] = await Promise.all([lab.getByTestId('penguin-original').boundingBox(), lab.getByTestId('penguin-encrypted').boundingBox()]);
    expect(encrypted!.y).toBeGreaterThan(original!.y + original!.height - 1);
    await expectNoHorizontalOverflow(page);
    expect(await blockingViolations(page)).toEqual([]);
  });
});
