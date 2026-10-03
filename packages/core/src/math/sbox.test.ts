import { describe, expect, it } from 'vitest';
import { sboxEntry } from './rijndaelAffine.ts';
import { buildInvSbox, buildSbox, INV_SBOX, SBOX } from './sbox.ts';

describe('SBOX / INV_SBOX', () => {
  it('is the frozen table of sboxEntry, a permutation of all bytes', () => {
    expect(SBOX).toEqual(buildSbox());
    expect(SBOX.every((output, x) => output === sboxEntry(x))).toBe(true);
    expect(new Set(SBOX).size).toBe(256);
    expect(Object.isFrozen(SBOX)).toBe(true);
    expect(SBOX[0x53]).toBe(0xed);
  });

  it('inverts the S-box', () => {
    expect(Object.isFrozen(INV_SBOX)).toBe(true);
    SBOX.forEach((output, x) => expect(INV_SBOX[output]).toBe(x));
    expect(buildInvSbox([2, 0, 1]).slice(0, 3)).toEqual([1, 2, 0]);
  });
});
