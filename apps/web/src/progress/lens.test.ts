// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyLensToDocument, DEFAULT_LENS, isLens, LENS_ORDER, lensAtLeast, resolveLabLens } from './lens.ts';

describe('lens', () => {
  it('orders lenses from story to cryptographer and defaults to engineer', () => {
    expect(LENS_ORDER).toEqual(['story', 'engineer', 'cryptographer']);
    expect(DEFAULT_LENS).toBe('engineer');
  });

  it('isLens recognises only the three lenses', () => {
    expect(LENS_ORDER.every(isLens)).toBe(true);
    expect(isLens('wizard')).toBe(false);
    expect(isLens(undefined)).toBe(false);
  });

  it.each([
    ['story', 'story', true],
    ['story', 'engineer', false],
    ['engineer', 'story', true],
    ['engineer', 'cryptographer', false],
    ['cryptographer', 'engineer', true],
  ] as const)('lensAtLeast(%s, %s) is %s', (current, level, expected) => {
    expect(lensAtLeast(current, level)).toBe(expected);
  });

  it('applyLensToDocument sets <html data-lens>', () => {
    applyLensToDocument('cryptographer');
    expect(document.documentElement.dataset.lens).toBe('cryptographer');
    expect(document.documentElement.getAttribute('data-lens')).toBe('cryptographer');
  });

  it.each([
    [undefined, undefined, 'engineer'],
    [undefined, 'story', 'story'],
    ['cryptographer', 'story', 'cryptographer'],
    ['story', undefined, 'story'],
  ] as const)('resolveLabLens(pinned %s, page %s) is %s', (pinned, pageLens, expected) => {
    expect(resolveLabLens(pinned, pageLens)).toBe(expected);
  });
});
