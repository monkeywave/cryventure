import { describe, expect, it } from 'vitest';
import { derive } from './module.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { aes128Bundle } from './testBundles.ts';

type Catalog = Record<string, string>;

/** Every label key the derived facets reference. */
function referencedKeys(): string[] {
  const keys = new Set<string>();
  JSON.stringify(derive(aes128Bundle()), (name, value: unknown) => {
    if (name === 'key' && typeof value === 'string' && value.startsWith('deriver.')) keys.add(value);
    return value;
  });
  return [...keys].sort();
}

describe('memory i18n', () => {
  it('has the same keys in en and de, all under deriver.memory.*', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).every((key) => key.startsWith('deriver.memory.'))).toBe(true);
  });

  it.each([
    ['en', en],
    ['de', de],
  ] as [string, Catalog][])('%s translates every label the facets use', (_, catalog) => {
    const keys = referencedKeys();
    expect(keys.length).toBeGreaterThan(8);
    expect(keys.filter((key) => !catalog[key])).toEqual([]);
  });

  it('has no keys the facets never use (the view owns its own title and provenance badge)', () => {
    const used = new Set(referencedKeys());
    expect(Object.keys(en).filter((key) => !used.has(key))).toEqual([]);
  });

  it('labels the variants for people, e.g. "x86-64 Linux · OpenSSL C reference"', () => {
    expect((en as Catalog)['deriver.memory.variant.x86_64-linux-gnu.c-ref']).toBe('x86-64 Linux · OpenSSL C reference');
  });
});
