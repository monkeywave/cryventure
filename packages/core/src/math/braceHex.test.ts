import { describe, expect, it } from 'vitest';
import { braceHex } from './braceHex.ts';

describe('braceHex', () => {
  it('writes a field element in FIPS 197 brace notation, lowercase and zero-padded', () => {
    expect(braceHex(0x57)).toBe('{57}');
    expect(braceHex(0x0a)).toBe('{0a}');
    expect(braceHex(0xc1)).toBe('{c1}');
  });

  it('pads unreduced 9-bit values to the requested digit count', () => {
    expect(braceHex(0x11b, 3)).toBe('{11b}');
    expect(braceHex(0xae, 3)).toBe('{0ae}');
  });
});
