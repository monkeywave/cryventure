import { describe, expect, it } from 'vitest';
import { catalogProblems } from '../_lib/sha/fixtures/shaDeriverChecks.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';

describe('isa-x86-sha catalogs', () => {
  it('have the same keys and {{params}} in EN and DE, all under deriver.isa-x86-sha.*', () => {
    expect(catalogProblems('isa-x86-sha', en, de)).toEqual([]);
  });

  it('label the variant after the Intel SHA extensions', () => {
    expect(en['deriver.isa-x86-sha.label']).toBe('x86-64 · SHA extensions (SHA-NI)');
  });
});
