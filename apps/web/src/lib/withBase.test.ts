import { describe, expect, it } from 'vitest';
import { joinBase, withBase } from './withBase.ts';

describe('joinBase', () => {
  it('joins root base with a relative path', () => {
    expect(joinBase('/', 'en/')).toBe('/en/');
  });

  it('avoids double slashes when path is absolute', () => {
    expect(joinBase('/', '/en/')).toBe('/en/');
    expect(joinBase('/cryventure/', '/de/')).toBe('/cryventure/de/');
  });

  it('adds the missing separator when base lacks a trailing slash', () => {
    expect(joinBase('/cryventure', 'en/')).toBe('/cryventure/en/');
  });

  it('keeps a trailing slash on the path', () => {
    expect(joinBase('/cryventure/', 'en/foundations/')).toBe('/cryventure/en/foundations/');
  });

  it('does not invent a trailing slash for files', () => {
    expect(joinBase('/cryventure/', 'favicon.svg')).toBe('/cryventure/favicon.svg');
  });

  it('returns the base for an empty or root path', () => {
    expect(joinBase('/cryventure/', '')).toBe('/cryventure/');
    expect(joinBase('/cryventure/', '/')).toBe('/cryventure/');
  });

  it('collapses multiple leading slashes in the path', () => {
    expect(joinBase('/', '//en/')).toBe('/en/');
  });
});

describe('withBase', () => {
  it('uses import.meta.env.BASE_URL (defaults to "/" under vitest)', () => {
    expect(withBase('/en/')).toBe(`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}en/`);
  });
});
