import { describe, expect, it } from 'vitest';
import de from './i18n/de.json';
import en from './i18n/en.json';

describe('isa-armv8 catalogs', () => {
  it('have the same keys in EN and DE, all under deriver.isa-armv8.*', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).every((key) => key.startsWith('deriver.isa-armv8.'))).toBe(true);
  });

  it('label the variant "AArch64 · ARMv8 Crypto Extensions"', () => {
    expect(en['deriver.isa-armv8.label']).toBe('AArch64 · ARMv8 Crypto Extensions');
  });
});
