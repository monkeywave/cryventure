import { describe, expect, it } from 'vitest';
import en from './en/ui.json';
import de from './de/ui.json';
import { isLocale, loadMessages, pickPrefix, toLocale } from './loadMessages.ts';

describe('toLocale / isLocale', () => {
  it('accepts supported locales and region variants', () => {
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

describe('loadMessages', () => {
  it('returns the flat dictionary of the requested locale', () => {
    expect(loadMessages('de', ['ui'])['ui.lab.reset']).toBe('Lab zurücksetzen');
    expect(loadMessages('en', ['ui'])['ui.lab.reset']).toBe('Reset lab');
  });

  it('falls back to English for unsupported locales', () => {
    expect(loadMessages('fr', ['ui'])).toEqual(en);
  });

  it('throws on an unknown namespace', () => {
    expect(() => loadMessages('en', ['nope'])).toThrow(/nope/);
  });

  it('EN and DE dictionaries have identical, non-empty keys', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const value of [...Object.values(en), ...Object.values(de)]) expect(value).not.toBe('');
  });
});

describe('pickPrefix', () => {
  it('keeps only keys under the prefix', () => {
    expect(pickPrefix({ 'ui.lab.a': '1', 'ui.notFound.b': '2' }, 'ui.lab.')).toEqual({ 'ui.lab.a': '1' });
  });
});
