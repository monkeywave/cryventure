import { describe, expect, it } from 'vitest';
import {
  affine,
  AFFINE_CONSTANT,
  buildInvSbox,
  buildSbox,
  INV_SBOX,
  lookup,
  SBOX,
  sboxEntry,
} from './sbox.ts';

const ALL_BYTES = Array.from({ length: 256 }, (_, i) => i);

describe('affine', () => {
  it('maps 0 to the affine constant and {ca} to {ed}', () => {
    expect(affine(0)).toBe(AFFINE_CONSTANT);
    expect(affine(0xca)).toBe(0xed);
  });
});

describe('sboxEntry', () => {
  it('matches known FIPS 197 Figure 7 values', () => {
    expect(sboxEntry(0x00)).toBe(0x63);
    expect(sboxEntry(0x53)).toBe(0xed);
    expect(sboxEntry(0x01)).toBe(0x7c);
    expect(sboxEntry(0xff)).toBe(0x16);
  });
});

describe('buildSbox / SBOX', () => {
  it('is a permutation of all 256 bytes', () => {
    expect(new Set(buildSbox()).size).toBe(256);
  });

  it('has no fixed points and no opposite fixed points', () => {
    for (const x of ALL_BYTES) {
      expect(SBOX[x]).not.toBe(x);
      expect(SBOX[x]).not.toBe(x ^ 0xff);
    }
  });
});

describe('buildInvSbox / INV_SBOX', () => {
  it('inverts the S-box for all 256 values in both directions', () => {
    for (const x of ALL_BYTES) {
      expect(INV_SBOX[SBOX[x] ?? -1]).toBe(x);
      expect(SBOX[INV_SBOX[x] ?? -1]).toBe(x);
    }
  });

  it('matches known inverse values and inverts arbitrary permutations', () => {
    expect(INV_SBOX[0x00]).toBe(0x52);
    expect(INV_SBOX[0xed]).toBe(0x53);
    expect(buildInvSbox([2, 0, 1])).toEqual([1, 2, 0, ...new Array<number>(253).fill(0)]);
  });
});

describe('lookup', () => {
  it('reads the table and masks the index to a byte', () => {
    expect(lookup(SBOX, 0x153)).toBe(0xed);
    expect(lookup([], 5)).toBe(0);
  });
});
