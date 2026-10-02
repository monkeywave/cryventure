import { describe, expect, it } from 'vitest';
import { checkTranslationFreshness, englishCounterpart, readSourceHash, sourceHashOf, stampSourceHash } from './translation-freshness.ts';

const EN = '---\ntitle: Hello\n---\n\n# Hello\n';
const EN_HASH = sourceHashOf(EN);
const DE_PATH = 'docs/de/a.mdx';
const dePage = (frontmatter: string) => `---\ntitle: Hallo\n${frontmatter}---\n\n# Hallo\n`;

describe('sourceHashOf', () => {
  it('matches `shasum -a 256` of the bytes', () => {
    expect(sourceHashOf('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sourceHashOf(new TextEncoder().encode('abc'))).toBe(sourceHashOf('abc'));
  });
});

describe('readSourceHash', () => {
  it('reads plain and quoted values from the frontmatter', () => {
    expect(readSourceHash(dePage(`sourceHash: ${EN_HASH}\n`))).toBe(EN_HASH);
    expect(readSourceHash(dePage(`sourceHash: '${EN_HASH}'\n`))).toBe(EN_HASH);
  });

  it('is undefined when absent, empty, or only in the body', () => {
    expect(readSourceHash(dePage(''))).toBeUndefined();
    expect(readSourceHash(dePage('sourceHash:\n'))).toBeUndefined();
    expect(readSourceHash(`# Hallo\nsourceHash: ${EN_HASH}\n`)).toBeUndefined();
  });
});

describe('englishCounterpart', () => {
  it('maps a DE page to the EN page at the same path', () => {
    expect(englishCounterpart('docs/de/symmetric/aes/index.mdx', 'docs')).toBe('docs/en/symmetric/aes/index.mdx');
  });

  it('rejects paths outside the DE docs tree', () => {
    expect(englishCounterpart('docs/en/index.mdx', 'docs')).toBeUndefined();
    expect(englishCounterpart('other/de/index.mdx', 'docs')).toBeUndefined();
  });
});

describe('checkTranslationFreshness', () => {
  it('passes a page stamped with the current EN hash', () => {
    expect(checkTranslationFreshness({ dePath: DE_PATH, deSource: dePage(`sourceHash: ${EN_HASH}\n`), enBytes: EN })).toEqual([]);
  });

  it('asks for a sourceHash when it is missing', () => {
    expect(checkTranslationFreshness({ dePath: DE_PATH, deSource: dePage(''), enBytes: EN })).toEqual([
      { severity: 'error', file: DE_PATH, message: 'add sourceHash (run `pnpm i18n:stamp <de-page>` after checking the translation)' },
    ]);
  });

  it('reports a stale translation when the EN page changed', () => {
    expect(checkTranslationFreshness({ dePath: DE_PATH, deSource: dePage(`sourceHash: ${EN_HASH}\n`), enBytes: `${EN}More.\n` })).toEqual([
      {
        severity: 'error',
        file: DE_PATH,
        message: `German translation is stale: ${DE_PATH} — update DE text, re-stamp sourceHash, set translation.status back to ai-reviewed if it was human-reviewed`,
      },
    ]);
  });
});

describe('stampSourceHash', () => {
  it('replaces an existing hash and leaves everything else alone', () => {
    const stale = dePage('sourceHash: sha256:00\ntranslation:\n  status: ai-reviewed\n');
    expect(stampSourceHash(stale, EN_HASH)).toBe(dePage(`sourceHash: ${EN_HASH}\ntranslation:\n  status: ai-reviewed\n`));
  });

  it('inserts the hash before the translation block', () => {
    expect(stampSourceHash(dePage('translation:\n  status: ai-reviewed\n'), EN_HASH)).toBe(dePage(`sourceHash: ${EN_HASH}\ntranslation:\n  status: ai-reviewed\n`));
  });

  it('appends the hash at the end of the frontmatter otherwise', () => {
    expect(stampSourceHash(dePage(''), EN_HASH)).toBe(dePage(`sourceHash: ${EN_HASH}\n`));
  });

  it('round-trips with readSourceHash and is idempotent', () => {
    const once = stampSourceHash(dePage(''), EN_HASH);
    expect(readSourceHash(once)).toBe(EN_HASH);
    expect(stampSourceHash(once, EN_HASH)).toBe(once);
  });

  it('throws for a page without frontmatter', () => {
    expect(() => stampSourceHash('# Hallo\n', EN_HASH)).toThrow('page has no frontmatter');
  });
});
