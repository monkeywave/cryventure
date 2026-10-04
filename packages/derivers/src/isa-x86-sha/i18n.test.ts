import { describe, expect, it } from 'vitest';
import de from './i18n/de.json';
import en from './i18n/en.json';

describe('isa-x86-sha catalogs', () => {
  it('have the same keys in EN and DE, all under deriver.isa-x86-sha.*', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).every((key) => key.startsWith('deriver.isa-x86-sha.'))).toBe(true);
  });

  it('use the same {{params}} in both languages', () => {
    const params = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
    for (const [key, text] of Object.entries(en))
      expect(params(de[key as keyof typeof de]), key).toEqual(params(text));
  });

  it('label the variant after the Intel SHA extensions', () => {
    expect(en['deriver.isa-x86-sha.label']).toBe('x86-64 · SHA extensions (SHA-NI)');
  });
});
