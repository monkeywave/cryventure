import { describe, expect, it } from 'vitest';
import { DOMAIN_SUFFIXES, spongePad } from '../_lib/keccak/padding.ts';
import { padTailNotation } from './steps.ts';

describe('padTailNotation', () => {
  it('writes one, two or more padding bytes in short form', () => {
    expect(padTailNotation(spongePad(new Uint8Array(135), 136, DOMAIN_SUFFIXES.sha3))).toBe('86');
    expect(padTailNotation(spongePad(new Uint8Array(134), 136, DOMAIN_SUFFIXES.shake))).toBe('1f 80');
    expect(padTailNotation(spongePad(new Uint8Array(3), 136, DOMAIN_SUFFIXES.keccak))).toBe('01 00 … 00 80');
  });
});
