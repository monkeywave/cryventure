import { describe, expect, it } from 'vitest';
import { mathTextSegments, toSuperscript } from './mathText.ts';

describe('mathTextSegments', () => {
  const plain = (text: string) => [{ text, sup: false }];

  it('raises numeric caret exponents to Unicode superscripts', () => {
    expect(mathTextSegments('a^1')).toEqual(plain('a¹'));
    expect(mathTextSegments('a·x^7')).toEqual(plain('a·x⁷'));
    expect(mathTextSegments('a^254 = (a^127)²')).toEqual(plain('a²⁵⁴ = (a¹²⁷)²'));
    expect(mathTextSegments('x^-1 and x^−1')).toEqual(plain('x⁻¹ and x⁻¹'));
  });

  it('raises grouped exponents without their brackets', () => {
    expect(mathTextSegments('a·x^(3−1) ≪ 1')).toEqual(plain('a·x³⁻¹ ≪ 1'));
    expect(mathTextSegments('x^{n+1}')).toEqual(plain('xⁿ⁺¹'));
  });

  it('keeps exponents without a superscript form as sup segments', () => {
    expect(mathTextSegments('b^{k} + 1')).toEqual([
      { text: 'b', sup: false },
      { text: 'k', sup: true },
      { text: ' + 1', sup: false },
    ]);
  });

  it('leaves text without carets alone', () => {
    expect(mathTextSegments('a⁻¹ = a²⁵⁴')).toEqual(plain('a⁻¹ = a²⁵⁴'));
    expect(mathTextSegments('')).toEqual([]);
    expect(mathTextSegments('x ^ y')).toEqual(plain('x ^ y'));
  });
});

describe('toSuperscript', () => {
  it('maps digits, signs and a few letters; undefined when a glyph is missing', () => {
    expect(toSuperscript('254')).toBe('²⁵⁴');
    expect(toSuperscript('n + 1')).toBe('ⁿ⁺¹');
    expect(toSuperscript('k')).toBeUndefined();
  });
});
