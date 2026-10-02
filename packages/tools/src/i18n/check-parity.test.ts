import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { discoverCatalogs, reportLines, runParityCheck } from './check-parity.ts';
import { sourceHashOf } from './translation-freshness.ts';

let root = '';

function write(path: string, content: unknown = {}): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
}

const EN_INDEX = '# Hi';

/** A DE page stamped with the hash of the fixture's EN index page. */
function germanPage(body: string): string {
  return `---\nsourceHash: ${sourceHashOf(EN_INDEX)}\n---\n${body}`;
}

function writeHealthyRepo(): void {
  write('packages/primitives/src/aes/i18n/en.json', { 'plugin.aes.title': 'AES cipher' });
  write('packages/primitives/src/aes/i18n/de.json', { 'plugin.aes.title': 'AES-Chiffre' });
  write('apps/web/src/i18n/en/ui.json', { 'ui.hello': 'Hello' });
  write('apps/web/src/i18n/de/ui.json', { 'ui.hello': 'Hallo' });
  write('apps/web/src/content/i18n/en.json', { 'site.title': 'CryVenture' });
  write('apps/web/src/content/i18n/de.json', { 'site.title': 'CryVenture' });
  write('apps/web/src/content/docs/en/index.mdx', EN_INDEX);
  write('apps/web/src/content/docs/de/index.mdx', germanPage('# Hallo'));
  write('packages/primitives/node_modules/x/i18n/en.json', { ignored: 'yes' });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cv-parity-'));
  writeHealthyRepo();
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('discoverCatalogs', () => {
  it('finds package, app and Starlight catalogs, skipping node_modules', () => {
    expect(discoverCatalogs(root)).toEqual([
      'packages/primitives/src/aes/i18n/de.json',
      'packages/primitives/src/aes/i18n/en.json',
      'apps/web/src/content/i18n/de.json',
      'apps/web/src/content/i18n/en.json',
      'apps/web/src/i18n/de/ui.json',
      'apps/web/src/i18n/en/ui.json',
    ]);
  });
});

describe('runParityCheck', () => {
  it('passes a healthy repo', () => {
    expect(runParityCheck(root)).toEqual({ catalogs: 6, issues: [], exitCode: 0 });
  });

  it('fails on a missing key and a page missing in DE', () => {
    write('apps/web/src/i18n/de/ui.json', {});
    write('apps/web/src/content/docs/en/foundations/xor.mdx', '# XOR');
    const report = runParityCheck(root);
    expect(report.exitCode).toBe(1);
    expect(reportLines(report)).toEqual([
      'error   apps/web/src/i18n/en/ui.json  ui.hello: missing in de',
      'error   apps/web/src/content/docs/en/foundations/xor.mdx  no de counterpart',
      'i18n parity: 6 catalogs, 2 error(s), 0 warning(s)',
    ]);
  });

  it('only warns (exit 0) about untranslated DE values', () => {
    write('apps/web/src/i18n/de/ui.json', { 'ui.hello': 'Hello' });
    const report = runParityCheck(root);
    expect(report.exitCode).toBe(0);
    expect(reportLines(report).at(-1)).toBe('i18n parity: 6 catalogs, 0 error(s), 1 warning(s)');
  });
});

describe('runParityCheck German style lint', () => {
  it('fails on style errors in DE catalogs and DE pages', () => {
    write('apps/web/src/i18n/de/ui.json', { 'ui.hello': 'Hallo, z.B. wie geht es Ihnen' });
    write('apps/web/src/content/docs/de/index.mdx', germanPage('# Hallo\n\nDer Chiffretext.'));
    const report = runParityCheck(root);
    expect(report.exitCode).toBe(1);
    expect(reportLines(report)).toEqual([
      'error   apps/web/src/i18n/de/ui.json  ui.hello: style: "z.B." needs a space: "z. B."',
      'error   apps/web/src/i18n/de/ui.json  ui.hello: style: formal address "Ihnen" mid-sentence; use the du-form',
      'error   apps/web/src/content/docs/de/index.mdx  line 6: style: "Chiffretext": use "Geheimtext" (glossary: ciphertext)',
      'i18n parity: 6 catalogs, 3 error(s), 0 warning(s)',
    ]);
  });
});

describe('runParityCheck translation freshness', () => {
  it('fails when a DE page has no sourceHash', () => {
    write('apps/web/src/content/docs/de/index.mdx', '# Hallo');
    const report = runParityCheck(root);
    expect(report.exitCode).toBe(1);
    expect(reportLines(report)[0]).toBe('error   apps/web/src/content/docs/de/index.mdx  add sourceHash (run `pnpm i18n:stamp <de-page>` after checking the translation)');
  });

  it('fails when the EN page changed after the DE page was stamped', () => {
    write('apps/web/src/content/docs/en/index.mdx', '# Hi there');
    const report = runParityCheck(root);
    expect(report.exitCode).toBe(1);
    expect(reportLines(report)[0]).toContain('German translation is stale: apps/web/src/content/docs/de/index.mdx');
  });

  it('skips DE pages without an EN counterpart (reported by the tree check instead)', () => {
    write('apps/web/src/content/docs/de/only-de.mdx', '# Nur DE');
    expect(reportLines(runParityCheck(root)).slice(0, -1)).toEqual(['error   apps/web/src/content/docs/de/only-de.mdx  no en counterpart']);
  });
});

describe('discoverCatalogs (real repo)', () => {
  it('covers the package-level catalogs (core) next to the plugin, viz and app catalogs', () => {
    const catalogs = discoverCatalogs(REPO_ROOT);
    expect(catalogs).toEqual(expect.arrayContaining(['packages/core/i18n/en.json', 'packages/core/i18n/de.json', 'packages/viz/src/i18n/de.json', 'apps/web/src/i18n/en/ui.json']));
    expect(catalogs.some((path) => path.startsWith('apps/web/src/i18n/') && path.endsWith('/core.json'))).toBe(false);
  });
});
