import { describe, expect, it } from 'vitest';
import { WHITE, composite, contrastRatio, effectiveBackground, parseCssColor, relativeLuminance } from './contrast.ts';

const BLACK = { r: 0, g: 0, b: 0, a: 1 };

describe('parseCssColor', () => {
  it('reads the computed rgb / rgba forms', () => {
    expect(parseCssColor('rgb(15, 23, 42)')).toEqual({ r: 15, g: 23, b: 42, a: 1 });
    expect(parseCssColor('rgba(251, 191, 36, 0.14)')).toEqual({ r: 251, g: 191, b: 36, a: 0.14 });
    expect(parseCssColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  it('treats transparent as fully transparent', () => {
    expect(parseCssColor('transparent').a).toBe(0);
    expect(parseCssColor('rgba(0, 0, 0, 0)').a).toBe(0);
  });

  it('rejects colours it cannot read', () => {
    expect(() => parseCssColor('oklch(0.5 0.1 200)')).toThrow(/unsupported/);
  });
});

describe('composite', () => {
  it('mixes by the top alpha', () => {
    expect(composite({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(composite(BLACK, WHITE)).toEqual(BLACK);
  });
});

describe('effectiveBackground', () => {
  it('stops at the first opaque layer', () => {
    const tint = { r: 255, g: 0, b: 0, a: 0.5 };
    expect(effectiveBackground([tint, BLACK, WHITE])).toEqual({ r: 127.5, g: 0, b: 0, a: 1 });
  });

  it('falls back to the base canvas', () => {
    expect(effectiveBackground([])).toEqual(WHITE);
    expect(effectiveBackground([{ r: 0, g: 0, b: 0, a: 0 }], BLACK)).toEqual(BLACK);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1);
    // #767676 on white is the classic 4.54:1 AA threshold colour.
    expect(contrastRatio(parseCssColor('rgb(118, 118, 118)'), WHITE)).toBeCloseTo(4.54, 2);
  });

  it('is symmetric and accounts for translucent text', () => {
    const slate = parseCssColor('rgb(91, 107, 128)');
    const surface = parseCssColor('rgb(248, 250, 252)');
    expect(contrastRatio(slate, surface)).toBeCloseTo(contrastRatio(surface, slate));
    expect(contrastRatio({ ...slate, a: 0.35 }, surface)).toBeLessThan(2);
  });
});
