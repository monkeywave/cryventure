import { createHash, createHmac, hkdfSync, pbkdf2Sync } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { interpolate, type Lens } from '@cryventure/core';
import viewEn from '../../../packages/views/src/derivation/i18n/en.json' with { type: 'json' };
import viewDe from '../../../packages/views/src/derivation/i18n/de.json' with { type: 'json' };
import aesEn from '../../../packages/primitives/src/aes/i18n/en.json' with { type: 'json' };
import aesDe from '../../../packages/primitives/src/aes/i18n/de.json' with { type: 'json' };
import hkdfEn from '../../../packages/primitives/src/hkdf/i18n/en.json' with { type: 'json' };
import hmacEn from '../../../packages/primitives/src/hmac/i18n/en.json' with { type: 'json' };
import hmacDe from '../../../packages/primitives/src/hmac/i18n/de.json' with { type: 'json' };
import sha256En from '../../../packages/primitives/src/sha256/i18n/en.json' with { type: 'json' };
import pbkdf2En from '../../../packages/primitives/src/pbkdf2/i18n/en.json' with { type: 'json' };
import sha3En from '../../../packages/primitives/src/sha3/i18n/en.json' with { type: 'json' };
import uiEn from '../src/i18n/en/ui.json' with { type: 'json' };
import { DESKTOP, KEY_SCHEDULE_LAB, PHONE, setLens, waitForLab, type Lang } from './labPage.ts';
import { LANGS } from './hashLessons.ts';
import { blockingViolations } from './helpers/axe.ts';
import { waitForLabMounted } from './macKdfLessons.ts';

// M7 labs (docs/M7.md §2, §4, §7): the derivation view (renamed from key-schedule) on AES, HKDF
// and PBKDF2 with zoom links into the hmac lab and from there into the hash lab, the Mac member
// pickers, PBKDF2 in the worker, and the named screenshots of the derivation and hmac views.

const VIEW = { en: viewEn, de: viewDe } as const;
const AES = { en: aesEn, de: aesDe } as const;
const LENSES: readonly Lens[] = ['story', 'engineer', 'cryptographer'];

const HKDF_LESSON = { path: 'kdf/hkdf/', labId: 'hkdf-rfc5869-a1' } as const;
const PBKDF2_LESSON = { path: 'kdf/pbkdf2/', labIds: { tc2: 'pbkdf2-rfc6070-tc2', tc3: 'pbkdf2-rfc6070-tc3' } } as const;
const HMAC_LESSON = { path: 'mac/hmac/', labId: 'hmac-tc1' } as const;

/** RFC 5869 A.1. */
const A1 = { ikm: Buffer.alloc(22, 0x0b), salt: Buffer.from('000102030405060708090a0b0c', 'hex'), info: Buffer.from('f0f1f2f3f4f5f6f7f8f9', 'hex'), length: 42 };
/** RFC 6070 inputs. */
const RFC6070 = { password: 'password', salt: 'salt' };
const SHA256_BLOCK = 64;

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
/** Output panel hex (grouped by 4 bytes) without spaces. */
const outputHex = async (lab: Locator, name: string) => ((await lab.getByTestId(`lab-output-${name}`).textContent()) ?? '').replace(/\s+/g, '');
const expectOutput = (lab: Locator, name: string, value: string, timeout?: number) =>
  expect.poll(() => outputHex(lab, name), { timeout }).toBe(value);

const derivation = (lab: Locator) => lab.locator('section.cv-derivation');
/** A result word of the derivation view, by its (translated) node name. */
const word = (view: Locator, name: string) => view.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: [0-9a-f]+$`) });
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Zoom links to the lab computing `name`: accessible name = visible text + "(computes <name>)". */
const zoomLink = (view: Locator, name: string, lang: Lang = 'en') => {
  const [, suffix = ''] = interpolate(VIEW[lang]['view.derivation.zoomLabel'], { link: '\u0000', name }).split('\u0000');
  return view.getByRole('link', { name: new RegExp(`^.+${escapeRegExp(suffix)}$`) });
};
/** The zoom targets' lab titles (EN), as the zoom link's visible text names them. */
const LAB_TITLES: Record<string, string> = { hmac: hmacEn['plugin.hmac.title'], sha256: sha256En['plugin.sha256.title'] };

/** Opens the chain of `name` and follows its zoom link; returns the standalone lab it opened. */
async function zoomInto(page: Page, view: Locator, name: string, producerId: string, lang: Lang = 'en'): Promise<Locator> {
  await word(view, name).click();
  const link = zoomLink(view, name, lang);
  await expect(link).toBeVisible();
  // The visible text names the target lab, and the accessible name starts with it (WCAG 2.5.3 Label in Name).
  const text = interpolate(VIEW[lang]['view.derivation.zoomTitled'], { lab: LAB_TITLES[producerId]! });
  await expect(link).toHaveText(text);
  await expect(link).toHaveAccessibleName(interpolate(VIEW[lang]['view.derivation.zoomLabel'], { link: text, name }));
  expect(new URL((await link.getAttribute('href'))!, page.url()).pathname).toMatch(new RegExp(`/${lang}/lab/${producerId}/$`));
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/lab/${producerId}/#lab=${producerId}&`));
  return waitForLab(page, producerId);
}

/* ---------- AES: the renamed view keeps working under its own heading ---------- */

for (const lang of LANGS) {
  test(`AES key expansion (${lang}): the derivation view is headed "${AES[lang]['plugin.aes.derivation.title']}" and opens a chain`, async ({ page }) => {
    await page.goto(`${lang}/${KEY_SCHEDULE_LAB.path}`);
    const lab = await waitForLab(page, KEY_SCHEDULE_LAB.labId);
    const view = derivation(lab);
    await expect(view.locator('.cv-derivation__title')).toHaveText(AES[lang]['plugin.aes.derivation.title']);
    await expect(view.locator('.cv-derivation__word')).toHaveCount(44);
    await view.getByRole('button', { name: /a0fafe17$/ }).click();
    await expect(view.locator('.cv-derivation__chain')).toContainText('a0fafe17');
    // AES words are not lab calls of their own: no zoom links.
    await expect(view.locator('.cv-derivation__zoom')).toHaveCount(0);
  });
}

test('a saved layout naming the old "key-schedule" panel still shows the derivation view', async ({ page }) => {
  await page.addInitScript((labId) => {
    localStorage.setItem(`cv.layout.v1.${labId}`, JSON.stringify({ version: 1, panelIds: ['state', 'key-schedule'], sizes: { state: 40, 'key-schedule': 60 } }));
  }, KEY_SCHEDULE_LAB.labId);
  await page.goto(`en/${KEY_SCHEDULE_LAB.path}`);
  const lab = await waitForLab(page, KEY_SCHEDULE_LAB.labId);
  await expect(derivation(lab).locator('.cv-derivation__word')).toHaveCount(44);
  const stored = await page.evaluate((labId) => localStorage.getItem(`cv.layout.v1.${labId}`), KEY_SCHEDULE_LAB.labId);
  expect(stored).not.toContain('key-schedule');
});

/* ---------- zoom: HKDF / PBKDF2 → hmac lab → hash lab ---------- */

test('HKDF: PRK zooms into the hmac lab with salt and IKM; its tag is HMAC-SHA-256(salt, IKM); the inner hash zooms into the SHA-256 lab', async ({ page }) => {
  test.slow(); // three labs in a row
  await page.goto(`en/${HKDF_LESSON.path}`);
  const hkdf = await waitForLab(page, HKDF_LESSON.labId);
  const view = derivation(hkdf);
  await expect(view.locator('.cv-derivation__title')).toHaveText(hkdfEn['plugin.hkdf.derivation.title']);
  const prk = hex(createHmac('sha256', A1.salt).update(A1.ikm).digest());
  expect(prk).toBe('077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5'); // RFC 5869 A.1
  await expect(word(view, hkdfEn['plugin.hkdf.node.prk'])).toHaveAccessibleName(`PRK: ${prk}`);

  const hmac = await zoomInto(page, view, hkdfEn['plugin.hkdf.node.prk'], 'hmac');
  await expect(hmac.getByLabel(hmacEn['plugin.hmac.param.key'], { exact: true })).toHaveValue(hex(A1.salt));
  await expect(hmac.getByLabel(hmacEn['plugin.hmac.param.input'], { exact: true })).toHaveValue(hex(A1.ikm));
  await expectOutput(hmac, 'tag', prk);

  // Inner hash = SHA-256((K0 ⊕ ipad) ‖ IKM), K0 = salt zero-padded to the block.
  const k0 = Buffer.concat([A1.salt, Buffer.alloc(SHA256_BLOCK - A1.salt.length)]);
  const innerInput = Buffer.concat([Buffer.from(k0.map((byte) => byte ^ 0x36)), A1.ikm]);
  const inner = hex(createHash('sha256').update(innerInput).digest());
  const sha256 = await zoomInto(page, derivation(hmac), hmacEn['plugin.hmac.derivation.inner'], 'sha256');
  await expectOutput(sha256, 'digest', inner);
});

test('HKDF: T(1) zooms into the hmac lab keyed with PRK; its tag is the first OKM block', async ({ page }) => {
  await page.goto(`en/${HKDF_LESSON.path}`);
  const view = derivation(await waitForLab(page, HKDF_LESSON.labId));
  const okm = hex(new Uint8Array(hkdfSync('sha256', A1.ikm, A1.salt, A1.info, A1.length)));
  const t1Name = interpolate(hkdfEn['plugin.hkdf.node.t'], { n: 1 });
  const hmac = await zoomInto(page, view, t1Name, 'hmac');
  await expectOutput(hmac, 'tag', okm.slice(0, 64));
});

test('PBKDF2: U1 of block 1 zooms into the hmac lab; its tag is HMAC-SHA-1(P, S ‖ INT(1)) (RFC 6070 test 2)', async ({ page }) => {
  await page.goto(`en/${PBKDF2_LESSON.path}`);
  const lab = await waitForLab(page, PBKDF2_LESSON.labIds.tc2);
  const view = derivation(lab);
  await expect(view.locator('.cv-derivation__title')).toHaveText(pbkdf2En['plugin.pbkdf2.derivation.title']);
  // T1 = U1 ⊕ U2 opens the chain that contains U1 with its zoom link.
  await word(view, interpolate(pbkdf2En['plugin.pbkdf2.derivation.t'], { block: 1 })).click();
  const u1Name = interpolate(pbkdf2En['plugin.pbkdf2.derivation.u'], { j: 1, block: 1 });
  // U1 shows twice in T1's chain (as U2's input and as an XOR operand of T1): the same zoom link.
  const links = zoomLink(view, u1Name);
  await expect(links).toHaveCount(2);
  expect(await links.nth(1).getAttribute('href')).toBe(await links.first().getAttribute('href'));
  await links.first().click();
  await expect(page).toHaveURL(/\/en\/lab\/hmac\/#lab=hmac&/);
  const hmac = await waitForLab(page, 'hmac');
  const message = Buffer.concat([Buffer.from(RFC6070.salt), Buffer.from([0, 0, 0, 1])]);
  await expect(hmac.getByLabel(hmacEn['plugin.hmac.param.key'], { exact: true })).toHaveValue(Buffer.from(RFC6070.password).toString('hex'));
  await expectOutput(hmac, 'tag', hex(createHmac('sha1', RFC6070.password).update(message).digest()));
});

test('PBKDF2 zoom links work in German too', async ({ page }) => {
  await page.goto(`de/${PBKDF2_LESSON.path}`);
  const view = derivation(await waitForLab(page, PBKDF2_LESSON.labIds.tc2));
  await expect(view.locator('.cv-derivation__zoom')).toHaveCount(0);
  await view.locator('.cv-derivation__word').first().click();
  const link = view.locator('.cv-derivation__zoom').first();
  await expect(link).toHaveText(interpolate(viewDe['view.derivation.zoomTitled'], { lab: hmacDe['plugin.hmac.title'] }));
  expect(new URL((await link.getAttribute('href'))!, page.url()).pathname).toMatch(/\/de\/lab\/hmac\/$/);
});

/* ---------- long values: hex wraps under the name, the chain never scrolls sideways ---------- */

/**
 * The chain lines whose name is hidden under (or squeezed to nothing by) their hex, how far the view
 * and the chain overflow, whether the chain is focusable, and how far the page scrolls sideways.
 */
const chainLayout = (view: Locator) =>
  view.evaluate((section) => {
    const chain = section.querySelector<HTMLElement>('.cv-derivation__chain')!;
    const overlapping = [...chain.querySelectorAll('.cv-derivation__link')]
      .filter((line) => {
        const name = line.querySelector('.cv-derivation__name')!.getBoundingClientRect();
        const hex = line.querySelector('.cv-derivation__hex')!.getBoundingClientRect();
        return name.width < 1 || (name.right > hex.left + 0.5 && name.left < hex.right && name.bottom > hex.top && name.top < hex.bottom);
      })
      .map((line) => line.textContent);
    const page = document.documentElement;
    return {
      overlapping,
      viewOverflow: section.scrollWidth - section.clientWidth,
      chainOverflowX: chain.scrollWidth - chain.clientWidth,
      chainScrolls: chain.scrollWidth > chain.clientWidth || chain.scrollHeight > chain.clientHeight,
      chainFocusable: chain.tabIndex === 0,
      pageOverflowX: page.scrollWidth - page.clientWidth,
    };
  });

const LONG_CHAINS = [
  { name: 'HKDF PRK (phone)', viewport: PHONE, path: HKDF_LESSON.path, labId: HKDF_LESSON.labId, open: /^PRK: / },
  { name: 'HMAC inner hash (desktop)', viewport: DESKTOP, path: HMAC_LESSON.path, labId: HMAC_LESSON.labId, open: /^Inner hash: / },
  { name: 'HMAC tag (phone)', viewport: PHONE, path: HMAC_LESSON.path, labId: HMAC_LESSON.labId, open: /^Tag: / },
  // K0 of a 131-byte key (RFC 4231 TC6): a short chain (4 lines) with a 262-digit hex.
  { name: 'HMAC long-key K0 (phone)', viewport: PHONE, path: HMAC_LESSON.path, labId: 'hmac-long-key', open: /^K0: / },
  { name: 'HMAC long-key K0 (desktop)', viewport: DESKTOP, path: HMAC_LESSON.path, labId: 'hmac-long-key', open: /^K0: / },
  { name: 'PBKDF2 T1 (phone)', viewport: PHONE, path: PBKDF2_LESSON.path, labId: PBKDF2_LESSON.labIds.tc2, open: /^T1 = / },
] as const;

for (const chain of LONG_CHAINS) {
  test(`derivation chain with long values, ${chain.name}: names stay readable, the hex wraps, nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize(chain.viewport);
    await page.goto(`en/${chain.path}`);
    const view = derivation(await waitForLab(page, chain.labId));
    await view.getByRole('button', { name: chain.open }).click();
    await expect(view.locator('.cv-derivation__chain')).toBeVisible();
    const layout = await chainLayout(view);
    expect(layout.overlapping, 'chain lines whose name is hidden under the hex').toEqual([]);
    expect(layout.viewOverflow, 'the result rows widen past the view').toBeLessThanOrEqual(0);
    expect(layout.chainOverflowX, 'the chain scrolls sideways').toBeLessThanOrEqual(0);
    expect(layout.pageOverflowX, 'the page scrolls sideways').toBeLessThanOrEqual(0);
    if (layout.chainScrolls) expect(layout.chainFocusable, 'a scrolling chain is keyboard-focusable').toBe(true);
  });
}

test('an open HMAC long-key K0 chain has no serious or critical axe violations (phone, dark)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`en/${HMAC_LESSON.path}`);
  const view = derivation(await waitForLab(page, 'hmac-long-key'));
  await view.getByRole('button', { name: /^K0: / }).click();
  await expect(view.locator('.cv-derivation__chain')).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
});

test('HKDF results name their values on the buttons (PRK, T(1), …)', async ({ page }) => {
  await page.goto(`en/${HKDF_LESSON.path}`);
  const view = derivation(await waitForLab(page, HKDF_LESSON.labId));
  await expect(word(view, 'PRK').locator('.cv-derivation__word-name')).toHaveText('PRK');
  await expect(word(view, interpolate(hkdfEn['plugin.hkdf.node.t'], { n: 1 })).locator('.cv-derivation__word-name')).toHaveText(interpolate(hkdfEn['plugin.hkdf.node.t'], { n: 1 }));
});

/* ---------- member pickers ---------- */

test('HKDF mac picker lists HMAC-SHA3-256 but no keyed BLAKE2 or KMAC; choosing it re-runs HKDF with SHA3-256', async ({ page }) => {
  await page.goto('en/lab/hkdf/');
  const lab = await waitForLab(page, 'hkdf');
  const picker = lab.getByLabel(hkdfEn['plugin.hkdf.param.mac'], { exact: true });
  await expect(picker).toHaveValue('sha256:hmac-sha-256');
  const options = await picker.locator('option').allTextContents();
  expect(options).toContain(sha3En['plugin.sha3.mac.hmac-sha3-256']);
  expect(options.filter((label) => /blake2|kmac/i.test(label)), options.join(', ')).toEqual([]);
  expect(options.every((label) => label.startsWith('HMAC-')), options.join(', ')).toBe(true);
  expect(await picker.locator('option').evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value))).not.toContain('blake2:blake2s-256');

  await picker.selectOption({ label: sha3En['plugin.sha3.mac.hmac-sha3-256'] });
  await expect(picker).toHaveValue('sha3:hmac-sha3-256');
  const ikm = Buffer.from(await lab.getByLabel(hkdfEn['plugin.hkdf.param.ikm'], { exact: true }).inputValue(), 'hex');
  const salt = Buffer.from(await lab.getByLabel(hkdfEn['plugin.hkdf.param.salt'], { exact: true }).inputValue(), 'hex');
  await expectOutput(lab, 'prk', hex(createHmac('sha3-256', salt).update(ikm).digest()));
});

test('PBKDF2 mac picker has no keyed BLAKE2 either (HMAC constructions only)', async ({ page }) => {
  await page.goto('en/lab/pbkdf2/');
  const lab = await waitForLab(page, 'pbkdf2');
  const options = await lab.getByLabel(pbkdf2En['plugin.pbkdf2.param.mac'], { exact: true }).locator('option').allTextContents();
  expect(options).toContain(sha3En['plugin.sha3.mac.hmac-sha3-256']);
  expect(options.filter((label) => /blake2|kmac/i.test(label))).toEqual([]);
});

/* ---------- PBKDF2 in the worker ---------- */

const computing = (lab: Locator) => lab.locator('.cv-lab__computing');

test('the "Computing…" live region is in the accessibility tree before its text appears', async ({ page }) => {
  await page.goto(`en/${PBKDF2_LESSON.path}`);
  const lab = await waitForLab(page, PBKDF2_LESSON.labIds.tc2);
  await expect(computing(lab)).toHaveText('');
  const box = await computing(lab).evaluate((element) => ({ display: getComputedStyle(element).display, rects: element.getClientRects().length }));
  expect(box.display).not.toBe('contents');
  expect(box.rects, 'the empty region keeps a box').toBeGreaterThan(0);
  await expect(lab.getByRole('status').and(computing(lab))).toHaveCount(1);
});

/** Records, in the page, whether the lab's "Computing…" line ever showed from now on. */
async function watchComputing(lab: Locator): Promise<() => Promise<boolean>> {
  await computing(lab).evaluate((element) => {
    const host = element as HTMLElement & { cvShown?: boolean };
    host.cvShown = false;
    new MutationObserver(() => {
      if (element.getAttribute('data-computing') === 'true') host.cvShown = true;
    }).observe(element, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  return () => computing(lab).evaluate((element) => Boolean((element as HTMLElement & { cvShown?: boolean }).cvShown));
}

test('PBKDF2 rfc6070-tc3 (c = 4096) finishes in the worker with the RFC 6070 key', async ({ page }) => {
  test.slow();
  await page.goto(`en/${PBKDF2_LESSON.path}`);
  const lab = await waitForLab(page, PBKDF2_LESSON.labIds.tc3);
  await expectOutput(lab, 'dk', '4b007901b765489abead49d926f721d065a429c1', 30_000);
  await expect(computing(lab)).toHaveText('');
});

/**
 * Counts the page's Web Workers and which of them the page terminated. Chrome may let a terminated
 * worker that is busy in a loop run on for a while before it stops the thread, so the test checks
 * that the lab called `terminate()`, not when Playwright reports the worker closed.
 */
async function recordWorkerTerminations(page: Page): Promise<() => Promise<boolean[]>> {
  await page.addInitScript(() => {
    const terminated: boolean[] = [];
    const NativeWorker = window.Worker;
    const ids = new WeakMap<Worker, number>();
    class CountedWorker extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        ids.set(this, terminated.push(false) - 1);
      }
      override terminate(): void {
        terminated[ids.get(this)!] = true;
        super.terminate();
      }
    }
    window.Worker = CountedWorker;
    (window as unknown as { __cvWorkers: boolean[] }).__cvWorkers = terminated;
  });
  return () => page.evaluate(() => [...(window as unknown as { __cvWorkers: boolean[] }).__cvWorkers]);
}

test('PBKDF2: a fast re-run never shows "Computing…"; a slow one does and is superseded by the next params', async ({ page }) => {
  test.slow();
  const workers = await recordWorkerTerminations(page);
  await page.goto('en/lab/pbkdf2/');
  const lab = await waitForLab(page, 'pbkdf2');
  const iterations = lab.getByLabel(pbkdf2En['plugin.pbkdf2.param.iterations'], { exact: true });
  const length = lab.getByLabel(pbkdf2En['plugin.pbkdf2.param.length'], { exact: true });
  await expectOutput(lab, 'dk', hex(pbkdf2Sync(RFC6070.password, RFC6070.salt, 1, 20, 'sha1')));
  expect((await workers()).length, 'PBKDF2 runs in a worker').toBeGreaterThan(0);

  // Fast: c = 2, 20 bytes.
  const shown = await watchComputing(lab);
  await iterations.fill('2');
  await expectOutput(lab, 'dk', hex(pbkdf2Sync(RFC6070.password, RFC6070.salt, 2, 20, 'sha1')));
  await page.waitForTimeout(500); // longer than the 300 ms delay: a late flash would show now
  expect(await shown()).toBe(false);

  // Slow: 128 bytes = 7 SHA-1 blocks at c = 100000 (700 000 HMAC calls), then superseded by c = 3.
  await length.fill('128');
  await expectOutput(lab, 'dk', hex(pbkdf2Sync(RFC6070.password, RFC6070.salt, 2, 128, 'sha1')));
  await iterations.fill('100000');
  await expect(computing(lab)).toHaveText(uiEn['ui.lab.computing']);
  const slowWorker = (await workers()).length - 1;
  expect((await workers())[slowWorker], 'the slow run is still running').toBe(false);
  await iterations.fill('3');
  const expected = hex(pbkdf2Sync(RFC6070.password, RFC6070.salt, 3, 128, 'sha1'));
  await expectOutput(lab, 'dk', expected);
  await expect(computing(lab)).toHaveText('');
  // The superseded run's worker was terminated when the next run started, not left to finish.
  expect((await workers())[slowWorker]).toBe(true);
  // … and no late result overwrites the last params' key.
  await page.waitForTimeout(3_000);
  expect(await outputHex(lab, 'dk')).toBe(expected);
  await expect(iterations).toHaveValue('3');
});

/* ---------- screenshots: the derivation views and the hmac lab ---------- */

interface ViewShot {
  name: string;
  path: string;
  labId: string;
  /** Node to open (by EN or DE name), so the chain and its zoom link show. */
  open: Record<Lang, RegExp>;
}

const VIEW_SHOTS: readonly ViewShot[] = [
  { name: 'derivation-aes', path: KEY_SCHEDULE_LAB.path, labId: KEY_SCHEDULE_LAB.labId, open: { en: /a0fafe17$/, de: /a0fafe17$/ } },
  { name: 'derivation-hkdf', path: HKDF_LESSON.path, labId: HKDF_LESSON.labId, open: { en: /^PRK: /, de: /^PRK: / } },
  { name: 'derivation-pbkdf2', path: PBKDF2_LESSON.path, labId: PBKDF2_LESSON.labIds.tc2, open: { en: /^T1 = /, de: /^T1 = / } },
  { name: 'hmac-derivation', path: HMAC_LESSON.path, labId: HMAC_LESSON.labId, open: { en: /^Inner hash: /, de: /^Innerer Hash: / } },
];

/**
 * Named screenshots for the visual gate: the derivation view with one chain open (AES, HKDF,
 * PBKDF2) and the hmac lab, as test-results/screens/<name>-<lang>-<scheme>-<size>-<lens>.png.
 */
test.describe('M7 derivation and hmac view screenshots', () => {
  for (const shot of VIEW_SHOTS)
    for (const lang of LANGS)
      for (const scheme of ['light', 'dark'] as const)
        for (const [size, viewport] of [['desktop', DESKTOP], ['phone', PHONE]] as const)
          test(`${shot.name} ${lang} ${scheme} ${size}`, async ({ page }) => {
            test.slow(); // three lenses per test
            await page.setViewportSize(viewport);
            await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
            await page.goto(`${lang}/${shot.path}`);
            const lab = await waitForLabMounted(page, shot.labId);
            const view = derivation(lab);
            await view.getByRole('button', { name: shot.open[lang] }).click();
            await expect(view.locator('.cv-derivation__chain')).toBeVisible();
            for (const lens of LENSES) {
              await setLens(page, lens);
              await expect(lab).toHaveAttribute('data-lens', lens);
              await expect(lab.locator('.cv-view__status[data-status="loading"]')).toHaveCount(0);
              const subject = shot.name.startsWith('hmac') ? lab : view;
              await subject.screenshot({ path: `test-results/screens/${shot.name}-${lang}-${scheme}-${size}-${lens}.png`, animations: 'disabled' });
            }
          });
});
