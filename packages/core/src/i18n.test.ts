import { describe, expect, it, vi } from 'vitest';
import { createTranslator, extractParams, i18nRef, interpolate } from './i18n.ts';

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

describe('i18nRef', () => {
  it('omits params when not given', () => {
    expect(i18nRef('a.b')).toEqual({ key: 'a.b' });
    expect(i18nRef('a.b', { n: 1 })).toEqual({ key: 'a.b', params: { n: 1 } });
  });
});
