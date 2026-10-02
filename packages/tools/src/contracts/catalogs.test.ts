import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPluginCatalogs } from './catalogs.ts';

describe('loadPluginCatalogs', () => {
  it('reads the real AES catalogs from the repo', () => {
    const catalogs = loadPluginCatalogs('primitives', 'aes');
    expect(catalogs.en['plugin.aes.title']).toBeTruthy();
    expect(catalogs.de['plugin.aes.title']).toBeTruthy();
  });

  it('reads EN/DE from a plugin folder and yields empty catalogs when files are missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'cv-catalogs-'));
    try {
      const dir = join(root, 'packages', 'views', 'src', 'demo', 'i18n');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'en.json'), '{"view.demo.title":"Demo"}');
      expect(loadPluginCatalogs('views', 'demo', root)).toEqual({ en: { 'view.demo.title': 'Demo' }, de: {} });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
