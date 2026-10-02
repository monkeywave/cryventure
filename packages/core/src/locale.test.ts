import { describe, expect, it } from 'vitest';
import { isLocale, mergeCatalogs, parseCatalogPath, toLocale } from './locale.ts';

describe('isLocale / toLocale', () => {
  it('accepts supported locales and narrows region variants', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(toLocale('de-AT')).toBe('de');
    expect(toLocale('EN-us')).toBe('en');
  });

  it('falls back to English for unknown or missing tags', () => {
    expect(toLocale('fr')).toBe('en');
    expect(toLocale(undefined)).toBe('en');
  });
});

describe('parseCatalogPath', () => {
  it('extracts folder and locale', () => {
    expect(parseCatalogPath('./aes/i18n/de.json')).toEqual({ folder: 'aes', locale: 'de' });
  });

  it('rejects other paths', () => {
    expect(parseCatalogPath('./aes/manifest.ts')).toBeUndefined();
  });
});

describe('mergeCatalogs', () => {
  const catalogs = {
    './state/i18n/en.json': { 'view.state.title': 'State' },
    './state/i18n/de.json': { 'view.state.title': 'Zustand' },
    './narration/i18n/de.json': { 'view.narration.title': 'Erzählung' },
  };

  it('merges every folder of one locale', () => {
    expect(mergeCatalogs(catalogs, 'de')).toEqual({ 'view.state.title': 'Zustand', 'view.narration.title': 'Erzählung' });
  });

  it('restricts the merge to one folder', () => {
    expect(mergeCatalogs(catalogs, 'de', 'state')).toEqual({ 'view.state.title': 'Zustand' });
    expect(mergeCatalogs(catalogs, 'en', 'nope')).toEqual({});
  });
});
