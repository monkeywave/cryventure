import { describe, expect, it } from 'vitest';
import de from './i18n/de.json';
import en from './i18n/en.json';

describe('isa-x86 catalogs', () => {
  it('have the same keys in EN and DE, all under deriver.isa-x86.*', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).every((key) => key.startsWith('deriver.isa-x86.'))).toBe(true);
  });

  it('label the variant "x86-64 · AES-NI"', () => {
    expect(en['deriver.isa-x86.label']).toBe('x86-64 · AES-NI');
  });
});
