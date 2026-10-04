import { expect, type Locator, type Page } from '@playwright/test';
import { labLocator, type Lang } from './labPage.ts';

// The M7 MAC and key-derivation lessons (docs/M7.md §7), shared by the macKdf*.spec.ts suites.

export interface MacKdfLesson {
  slug: string;
  titles: Record<Lang, string>;
  /** Lab ids in page order; the first one is the screenshot subject. */
  labIds: readonly string[];
}

export const M7_LESSONS: readonly MacKdfLesson[] = [
  { slug: 'mac/', titles: { en: 'Message authentication codes', de: 'Nachrichtenauthentifizierungscodes' }, labIds: ['hmac-jefe'] },
  { slug: 'mac/hmac/', titles: { en: 'HMAC inside', de: 'HMAC von innen' }, labIds: ['hmac-tc1', 'hmac-long-key', 'hmac-verify-fail'] },
  { slug: 'mac/kmac/', titles: { en: 'KMAC: a MAC from the sponge', de: 'KMAC: ein MAC aus dem Sponge' }, labIds: ['kmac128-sample1', 'kmac256-sample4', 'blake2s-256-keyed'] },
  { slug: 'kdf/hkdf/', titles: { en: 'HKDF', de: 'HKDF' }, labIds: ['hkdf-rfc5869-a1', 'hkdf-rfc5869-a3', 'hkdf-tls13-derived'] },
  { slug: 'kdf/pbkdf2/', titles: { en: 'PBKDF2', de: 'PBKDF2' }, labIds: ['pbkdf2-rfc6070-tc2', 'pbkdf2-rfc6070-tc3'] },
  {
    slug: 'kdf/tls-prf/',
    titles: { en: 'The TLS PRFs: P_hash, MD5 ⊕ SHA-1 and P_SHA256', de: 'Die TLS-PRFs: P_hash, MD5 ⊕ SHA-1 und P_SHA256' },
    labIds: ['tls12-prf-master-secret', 'tls10-prf-master-secret'],
  },
];

/** Sidebar groups after "Hash functions" and their page order (docs/M7.md §7). */
export const M7_SIDEBAR = [
  { label: { en: 'MACs', de: 'MACs' }, slugs: ['mac/', 'mac/hmac/', 'mac/kmac/'] },
  { label: { en: 'Key derivation', de: 'Schlüsselableitung' }, slugs: ['kdf/hkdf/', 'kdf/pbkdf2/', 'kdf/tls-prf/'] },
] as const;

export const HASH_GROUP_LABEL: Record<Lang, string> = { en: 'Hash functions', de: 'Hashfunktionen' };

/** Screenshot file stem of a lesson: `mac-index`, `mac-hmac`, `kdf-hkdf`, … */
export function screenshotStem(slug: string): string {
  const parts = slug.split('/').filter(Boolean);
  return parts.length === 1 ? `${parts[0]}-index` : parts.join('-');
}

/**
 * Records `securitypolicyviolation` events and CSP console messages (docs/M4.md §9) from now on,
 * across navigations; read the array after the page settled.
 */
export async function recordCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__cvM7CspViolation', (violation: string) => violations.push(violation));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __cvM7CspViolation: (v: string) => void }).__cvM7CspViolation;
      report(`${event.effectiveDirective} ${event.blockedURI} ${event.sample}`);
    });
  });
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(`console: ${message.text()}`);
  });
  return violations;
}

/** How far the page scrolls sideways (0 = never). */
export const pageOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

/**
 * `waitForLab` with the hydration allowance `mountLabs` uses (15 s): screenshot runs open many
 * heavy lab pages at once, and on a loaded machine a lab island can take longer than 5 s to mount.
 */
export async function waitForLabMounted(page: Page, labId: string): Promise<Locator> {
  const lab = labLocator(page, labId);
  await lab.scrollIntoViewIfNeeded();
  await expect(lab.locator('section.cv-lab')).toBeVisible({ timeout: 15_000 });
  return lab;
}
