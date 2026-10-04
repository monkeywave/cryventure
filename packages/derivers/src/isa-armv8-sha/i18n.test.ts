import { describe, expect, it } from 'vitest';
import { catalogProblems } from '../_lib/sha/fixtures/shaDeriverChecks.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';

describe('isa-armv8-sha catalogs', () => {
  it('have the same keys and {{params}} in EN and DE, all under deriver.isa-armv8-sha.*', () => {
    expect(catalogProblems('isa-armv8-sha', en, de)).toEqual([]);
  });

  it('label the variant after the ARMv8 SHA2 extension', () => {
    expect(en['deriver.isa-armv8-sha.label']).toBe('AArch64 · ARMv8 SHA2 extension');
  });
});
