import { expect, test as base, type Page } from '@playwright/test';
import { labButton, waitForLab } from './labPage.ts';

// docs/M4.md §9: the generated CSP must not block anything the site does. Every test records
// `securitypolicyviolation` events (all frames, across navigations) and CSP console errors, and
// fails on any. Relative URLs resolve against baseURL, so this runs for CV_BASE sub-path builds too.

interface Violation {
  directive: string;
  blockedURI: string;
  sample: string;
  page: string;
}

/** Collects violations through a binding, so reports survive navigations and redirects. */
async function recordCspViolations(page: Page): Promise<{ violations: Violation[]; consoleErrors: string[] }> {
  const violations: Violation[] = [];
  const consoleErrors: string[] = [];
  await page.exposeFunction('__cvCspViolation', (violation: Violation) => violations.push(violation));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __cvCspViolation: (v: unknown) => void }).__cvCspViolation;
      report({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sample: event.sample,
        page: location.pathname,
      });
    });
  });
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) consoleErrors.push(message.text());
  });
  return { violations, consoleErrors };
}

/** Auto fixture: every test starts recording and fails afterwards on any recorded violation. */
const test = base.extend<{ cspRecorder: void }>({
  cspRecorder: [
    async ({ page }, use) => {
      const { violations, consoleErrors } = await recordCspViolations(page);
      await use();
      expect(violations, 'securitypolicyviolation events').toEqual([]);
      expect(consoleErrors, 'CSP console errors').toEqual([]);
    },
    { auto: true },
  ],
});

async function expectStrictMetaPolicy(page: Page): Promise<void> {
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toMatch(/script-src 'self' 'wasm-unsafe-eval' 'sha256-/);
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
}

test.describe('CSP (no violations)', () => {
  test.use({ locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' } });

  test('root redirect and home page', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectStrictMetaPolicy(page);
    // The lens script ran under the policy (inline, hash-allowed).
    await expect(page.locator('html')).toHaveAttribute('data-lens', /.+/);
  });

  test('a lesson with a lab hydrates and steps (CTR)', async ({ page }) => {
    await page.goto('en/symmetric/modes/ctr/');
    await expectStrictMetaPolicy(page);
    const lab = await waitForLab(page, 'ctr-keystream');
    const next = labButton(lab, 'ui.player.next');
    await next.click();
    await next.click();
    await expect(lab.locator('.cv-timeline__step')).not.toBeEmpty();
  });

  test('the SHA-256 lesson hydrates its wordops, constants and lazily derived SHA-NI labs', async ({ page }) => {
    await page.goto('en/hash/sha256/');
    await expectStrictMetaPolicy(page);
    const round = await waitForLab(page, 'sha256-abc');
    await labButton(round, 'ui.player.next').click();
    await expect(round.locator('.cv-wordops [data-term="T1"]')).toBeVisible();
    const constants = await waitForLab(page, 'sha256-k');
    await expect(constants.locator('.cv-wordops')).toBeVisible();
    const hardware = await waitForLab(page, 'sha256-sha-ni');
    await expect(hardware.locator('.cv-instructions')).toContainText(/sha256rnds2/i);
    await expect(hardware.locator('.cv-registers .cv-cell').first()).toBeVisible();
  });

  test('the standalone lab route /en/lab/aes/', async ({ page }) => {
    await page.goto('en/lab/aes/');
    await expectStrictMetaPolicy(page);
    const lab = await waitForLab(page, 'aes');
    await expect(lab.locator('[data-region="state"] .cv-cell').first()).toBeVisible();
    await labButton(lab, 'ui.player.next').click();
  });

  test('Pagefind search (WebAssembly) returns results', async ({ page }) => {
    await page.goto('en/');
    await page.locator('site-search button[data-open-modal]').click();
    await page.locator('.pagefind-ui__search-input').fill('XOR');
    await expect(page.locator('.pagefind-ui__result-link').first()).toBeVisible();
  });
});
