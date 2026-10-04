import { describe, expect, it } from 'vitest';
import { catalogProblems } from '../_lib/sha/fixtures/shaDeriverChecks.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';

describe('isa-armv8-sha3 catalogs', () => {
  it('have the same keys and {{params}} in EN and DE, all under deriver.isa-armv8-sha3.*', () => {
    expect(catalogProblems('isa-armv8-sha3', en, de)).toEqual([]);
  });

  it('label the variant after the ARMv8.2 SHA3 extension', () => {
    expect(en['deriver.isa-armv8-sha3.label']).toBe('AArch64 · ARMv8.2 SHA3 extension');
    expect(de['deriver.isa-armv8-sha3.label']).toBe('AArch64 · ARMv8.2-SHA3-Erweiterung');
  });

  it('quote German style („…“) and never English quotes in DE', () => {
    const german = Object.values(de).join('\n');
    expect(german).not.toContain('"');
    expect(german).toContain('„partial“');
  });
});
