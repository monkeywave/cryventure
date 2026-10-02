import { describe, expect, it } from 'vitest';
import {
  compareCatalogs,
  compareDocTrees,
  flattenCatalog,
  formatIssues,
  hasErrors,
  isTranslationExempt,
  pairCatalogPaths,
  swapLocale,
} from './parity.ts';

const messagesOf = (issues: ReturnType<typeof compareCatalogs>) => issues.map((entry) => `${entry.severity}:${entry.key}:${entry.message}`);

describe('flattenCatalog', () => {
  it('keeps flat catalogs and flattens nested ones', () => {
    expect(flattenCatalog({ 'a.b': 'x' })).toEqual({ 'a.b': 'x' });
    expect(flattenCatalog({ a: { b: 'x', c: { d: 'y' } } })).toEqual({ 'a.b': 'x', 'a.c.d': 'y' });
    expect(flattenCatalog('nope')).toEqual({});
  });
});

describe('isTranslationExempt', () => {
  it.each(['CryVenture', 'AES', '0x1f', '{{count}} / {{total}}', '—', 'AES-GCM', 'FIPS 197', 'SubBytes', 'InvMixColumns', 'Debugger'])('exempts %j', (value) => {
    expect(isTranslationExempt(value)).toBe(true);
  });

  it.each(['State', 'AES key', 'Round {{round}}'])('does not exempt %j', (value) => {
    expect(isTranslationExempt(value)).toBe(false);
  });
});

describe('compareCatalogs', () => {
  it('accepts catalogs in sync', () => {
    expect(compareCatalogs({ k: 'Round {{n}}' }, { k: 'Runde {{n}}' }, 'f')).toEqual([]);
  });

  it('reports missing, extra, empty and non-string keys as errors', () => {
    const issues = compareCatalogs({ a: 'A', b: ' ', n: 1 }, { b: 'B', c: 'C', n: 'N' }, 'f');
    expect(messagesOf(issues)).toEqual([
      'error:a:missing in de',
      'error:c:extra in de (not in en)',
      'error:b:empty in en',
      'error:n:not a string in en',
    ]);
    expect(issues.every((entry) => entry.file === 'f')).toBe(true);
  });

  it('reports mismatched {{params}} as errors', () => {
    expect(messagesOf(compareCatalogs({ k: '{{a}} {{b}}' }, { k: '{{b}} {{c}}' }, 'f'))).toEqual(['error:k:{{params}} differ: en [a, b] vs de [b, c]']);
  });

  it('warns about identical values and untranslated stubs, but not about exempt ones', () => {
    const issues = compareCatalogs({ same: 'State', stub: 'Hello', noun: 'CryVenture' }, { same: 'State', stub: '[DE] Hello', noun: 'CryVenture' }, 'f');
    expect(messagesOf(issues)).toEqual(['warning:same:de value is identical to en', 'warning:stub:untranslated scaffold stub in de']);
    expect(hasErrors(issues)).toBe(false);
  });
});

describe('swapLocale', () => {
  it('swaps file and directory locales', () => {
    expect(swapLocale('p/src/aes/i18n/en.json', 'en', 'de')).toBe('p/src/aes/i18n/de.json');
    expect(swapLocale('apps/web/src/i18n/en/ui.json', 'en', 'de')).toBe('apps/web/src/i18n/de/ui.json');
    expect(swapLocale('p/i18n/fr.json', 'en', 'de')).toBeUndefined();
    expect(swapLocale('p/en', 'en', 'de')).toBeUndefined();
  });
});

describe('pairCatalogPaths', () => {
  it('pairs counterparts and reports orphans on either side', () => {
    const result = pairCatalogPaths(['a/i18n/en.json', 'a/i18n/de.json', 'b/i18n/en.json', 'c/i18n/de/x.json']);
    expect(result.pairs).toEqual([{ en: 'a/i18n/en.json', de: 'a/i18n/de.json' }]);
    expect(result.issues.map((entry) => `${entry.file}:${entry.message}`)).toEqual(['b/i18n/en.json:no de counterpart', 'c/i18n/de/x.json:no en counterpart']);
  });
});

describe('compareDocTrees', () => {
  it('reports pages that exist in one locale only', () => {
    const issues = compareDocTrees(['index.mdx', 'a/b.mdx'], ['index.mdx', 'c.md'], 'docs');
    expect(issues.map((entry) => `${entry.severity}:${entry.file}:${entry.message}`)).toEqual(['error:docs/en/a/b.mdx:no de counterpart', 'error:docs/de/c.md:no en counterpart']);
  });
});

describe('hasErrors / formatIssues', () => {
  it('detects errors and formats errors before warnings', () => {
    const issues = [
      { severity: 'warning' as const, file: 'f', key: 'k', message: 'w' },
      { severity: 'error' as const, file: 'g', message: 'e' },
    ];
    expect(hasErrors(issues)).toBe(true);
    expect(hasErrors([issues[0]!])).toBe(false);
    expect(formatIssues(issues)).toEqual(['error   g  e', 'warning f  k: w']);
  });
});
