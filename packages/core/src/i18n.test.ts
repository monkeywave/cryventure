import { describe, expect, it, vi } from 'vitest';
import { createTranslator, extractParams, i18nRef, interpolate, parsePluralKey, pluralCandidates, resolveMessageKey } from './i18n.ts';

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(interpolate('Round {{n}} of {{ total }}', { n: 1, total: 10 })).toBe('Round 1 of 10');
  });
  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hi {{name}}')).toBe('Hi {{name}}');
  });
});

describe('extractParams', () => {
  it('returns unique names in order', () => {
    expect(extractParams('{{a}} {{b}} {{ a }}')).toEqual(['a', 'b']);
  });
  it('returns empty for plain text', () => {
    expect(extractParams('no params')).toEqual([]);
  });
});

describe('createTranslator', () => {
  const messages = { 'core.greet': 'Hello {{name}}', 'core.plain': 'Plain' };

  it('translates keys with params', () => {
    const t = createTranslator(messages);
    expect(t('core.greet', { name: 'Ada' })).toBe('Hello Ada');
    expect(t('core.plain')).toBe('Plain');
  });
  it('accepts an I18nRef and lets explicit params override ref params', () => {
    const t = createTranslator(messages);
    expect(t({ key: 'core.greet', params: { name: 'Ada' } })).toBe('Hello Ada');
    expect(t({ key: 'core.greet', params: { name: 'Ada' } }, { name: 'Bob' })).toBe('Hello Bob');
  });
  it('returns the key and reports missing keys', () => {
    const onMissing = vi.fn();
    const t = createTranslator(messages, { onMissing });
    expect(t('core.nope')).toBe('core.nope');
    expect(onMissing).toHaveBeenCalledWith('core.nope');
  });
  it('does not resolve inherited object properties', () => {
    const t = createTranslator(messages);
    expect(t('toString')).toBe('toString');
  });
});

describe('plural forms', () => {
  const messages = {
    'x.rot_one': 'rotates {{count}} position',
    'x.rot_other': 'rotates {{count}} positions',
    'x.bytes_zero': 'no bytes',
    'x.bytes_other': '{{count}} bytes',
    'x.plain': 'plain {{count}}',
  };

  it('picks _one / _other via Intl.PluralRules', () => {
    const t = createTranslator(messages, { locale: 'de' });
    expect(t('x.rot', { count: 1 })).toBe('rotates 1 position');
    expect(t('x.rot', { count: 3 })).toBe('rotates 3 positions');
    expect(t('x.rot', { count: 0 })).toBe('rotates 0 positions');
  });
  it('reads count from I18nRef params', () => {
    const t = createTranslator(messages);
    expect(t(i18nRef('x.rot', { count: 1 }))).toBe('rotates 1 position');
  });
  it('uses _zero only as an explicit override for 0', () => {
    const t = createTranslator(messages);
    expect(t('x.bytes', { count: 0 })).toBe('no bytes');
    expect(t('x.bytes', { count: 1 })).toBe('1 bytes');
  });
  it('falls back to the bare key, and to _other without a count', () => {
    const t = createTranslator(messages);
    expect(t('x.plain', { count: 1 })).toBe('plain 1');
    expect(t('x.rot')).toBe('rotates {{count}} positions');
    expect(t('x.rot', { count: '1' })).toBe('rotates 1 positions');
  });
  it('reports a missing key under its base name', () => {
    const onMissing = vi.fn();
    const t = createTranslator(messages, { onMissing });
    expect(t('x.none', { count: 2 })).toBe('x.none');
    expect(onMissing).toHaveBeenCalledWith('x.none');
  });
  it('parses plural keys', () => {
    expect(parsePluralKey('a.b_one')).toEqual({ base: 'a.b', category: 'one' });
    expect(parsePluralKey('a.b_other')).toEqual({ base: 'a.b', category: 'other' });
    expect(parsePluralKey('a.bone')).toBeUndefined();
  });
  it('resolves the catalog key a translation would use', () => {
    expect(resolveMessageKey(messages, 'x.rot', { count: 1 }, 'de')).toBe('x.rot_one');
    expect(resolveMessageKey(messages, 'x.plain', { count: 1 })).toBe('x.plain');
    expect(resolveMessageKey(messages, 'x.none')).toBeUndefined();
  });
  it('orders candidates', () => {
    expect(pluralCandidates('k', 1, 'en')).toEqual(['k_one', 'k_other', 'k']);
    expect(pluralCandidates('k', 0, 'en')).toEqual(['k_zero', 'k_other', 'k']);
    expect(pluralCandidates('k', undefined, 'en')).toEqual(['k', 'k_other']);
  });
});

describe('i18nRef', () => {
  it('omits params when not given', () => {
    expect(i18nRef('a.b')).toEqual({ key: 'a.b' });
    expect(i18nRef('a.b', { n: 1 })).toEqual({ key: 'a.b', params: { n: 1 } });
  });
});
