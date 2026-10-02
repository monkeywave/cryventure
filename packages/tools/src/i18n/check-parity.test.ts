import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { discoverCatalogs, reportLines, runParityCheck } from './check-parity.ts';

let root = '';

function write(path: string, content: unknown = {}): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
}

function writeHealthyRepo(): void {
  write('packages/primitives/src/aes/i18n/en.json', { 'plugin.aes.title': 'AES cipher' });
  write('packages/primitives/src/aes/i18n/de.json', { 'plugin.aes.title': 'AES-Chiffre' });
  write('apps/web/src/i18n/en/ui.json', { 'ui.hello': 'Hello' });
  write('apps/web/src/i18n/de/ui.json', { 'ui.hello': 'Hallo' });
  write('apps/web/src/content/i18n/en.json', { 'site.title': 'CryVenture' });
  write('apps/web/src/content/i18n/de.json', { 'site.title': 'CryVenture' });
  write('apps/web/src/content/docs/en/index.mdx', '# Hi');
  write('apps/web/src/content/docs/de/index.mdx', '# Hallo');
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

describe('discoverCatalogs (real repo)', () => {
  it('covers the package-level catalogs (core) next to the plugin, viz and app catalogs', () => {
    const catalogs = discoverCatalogs(REPO_ROOT);
    expect(catalogs).toEqual(expect.arrayContaining(['packages/core/i18n/en.json', 'packages/core/i18n/de.json', 'packages/viz/src/i18n/de.json', 'apps/web/src/i18n/en/ui.json']));
    expect(catalogs.some((path) => path.startsWith('apps/web/src/i18n/') && path.endsWith('/core.json'))).toBe(false);
  });
});
