import { toHex } from '@cryventure/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addRoundKey,
  invMixColumn,
  invMixColumns,
  invShiftRows,
  invSubBytes,
  mixColumn,
  mixColumns,
  shiftRows,
  subBytes,
} from './ops.ts';
import { hexBytes as bytes } from './testHelpers.ts';

const arbitraryState = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 16, maxLength: 16 });
const arbitraryColumn = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 4, maxLength: 4 });

// FIPS 197 App. B, round 1.
const ROUND1_START = '193de3bea0f4e22b9ac68d2ae9f84808';
const ROUND1_SBOX = 'd42711aee0bf98f1b8b45de51e415230';
const ROUND1_SROW = 'd4bf5d30e0b452aeb84111f11e2798e5';
const ROUND1_MCOL = '046681e5e0cb199a48f8d37a2806264c';
const ROUND1_KEY = 'a0fafe1788542cb123a339392a6c7605';
const ROUND2_START = 'a49c7ff2689f352b6b5bea43026a5049';

describe('subBytes / invSubBytes', () => {
  it('matches App. B round 1', () => {
    expect(toHex(subBytes(bytes(ROUND1_START)))).toBe(ROUND1_SBOX);
    expect(toHex(invSubBytes(bytes(ROUND1_SBOX)))).toBe(ROUND1_START);
  });
});

describe('shiftRows / invShiftRows', () => {
  it('matches App. B round 1 and inverts', () => {
    expect(toHex(shiftRows(bytes(ROUND1_SBOX)).state)).toBe(ROUND1_SROW);
    expect(toHex(invShiftRows(bytes(ROUND1_SROW)).state)).toBe(ROUND1_SBOX);
  });

  it('reports 12 moves for rows 1..3 consistent with the result', () => {
    const input = Array.from({ length: 16 }, (_, i) => i);
    const { state, moves } = shiftRows(input);
    expect(moves).toHaveLength(12);
    expect(moves).toContainEqual({ from: 5, to: 1 });
    for (const move of moves) expect(state[move.to]).toBe(input[move.from]);
    for (const move of invShiftRows(input).moves)
      expect(invShiftRows(input).state[move.to]).toBe(move.from);
  });

  it('roundtrips for arbitrary states', () => {
    fc.assert(
      fc.property(arbitraryState, (s) => {
        expect(invShiftRows(shiftRows(s).state).state).toEqual(s);
      }),
    );
  });
});

describe('mixColumn / invMixColumn', () => {
  it('matches well-known test columns', () => {
    expect(mixColumn([0xdb, 0x13, 0x53, 0x45])).toEqual([0x8e, 0x4d, 0xa1, 0xbc]);
    expect(mixColumn([0xf2, 0x0a, 0x22, 0x5c])).toEqual([0x9f, 0xdc, 0x58, 0x9d]);
    expect(invMixColumn([0x8e, 0x4d, 0xa1, 0xbc])).toEqual([0xdb, 0x13, 0x53, 0x45]);
  });

  it('roundtrips for arbitrary columns', () => {
    fc.assert(
      fc.property(arbitraryColumn, (c) => {
        expect(invMixColumn(mixColumn(c))).toEqual(c);
      }),
    );
  });
});

describe('mixColumns / invMixColumns', () => {
  it('matches App. B round 1 and inverts', () => {
    expect(toHex(mixColumns(bytes(ROUND1_SROW)))).toBe(ROUND1_MCOL);
    expect(toHex(invMixColumns(bytes(ROUND1_MCOL)))).toBe(ROUND1_SROW);
  });
});

describe('addRoundKey', () => {
  it('matches App. B round 1 and is an involution', () => {
    const next = addRoundKey(bytes(ROUND1_MCOL), bytes(ROUND1_KEY));
    expect(toHex(next)).toBe(ROUND2_START);
    expect(toHex(addRoundKey(next, bytes(ROUND1_KEY)))).toBe(ROUND1_MCOL);
  });
});
