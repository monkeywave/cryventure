import { describe, expect, it } from 'vitest';
import { namespaceTranslator } from './namespaceTranslator.ts';

describe('namespaceTranslator', () => {
  it('translates keys of the requested namespace in the page locale', () => {
    expect(namespaceTranslator('en', 'lens')('lens.name.story')).toBe('Story');
    expect(namespaceTranslator('de', 'lens')('lens.name.story')).toBe('Erzählung');
  });

  it('falls back to the default locale for a missing or unsupported language', () => {
    expect(namespaceTranslator(undefined, 'lens')('lens.select.label')).toBe('Lens');
    expect(namespaceTranslator('xx', 'lens')('lens.select.label')).toBe('Lens');
  });

  it('only knows the one namespace (other keys render as themselves)', () => {
    expect(namespaceTranslator('en', 'lens')('quiz.progress.export')).toBe('quiz.progress.export');
  });

  it('rejects an unknown namespace', () => {
    expect(() => namespaceTranslator('en', 'nope')).toThrow(/Unknown i18n namespace/);
  });
});
