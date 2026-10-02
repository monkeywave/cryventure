import { describe, expect, it } from 'vitest';
import { ginv } from './gf256.ts';
import { affine, AFFINE_CONSTANT, affineSteps, sboxEntry } from './rijndaelAffine.ts';

const ALL_BYTES = Array.from({ length: 256 }, (_, i) => i);

/** FIPS 197 Figure 7, row by row. */
const FIPS_SBOX_HEX = [
  '637c777bf26b6fc53001672bfed7ab76',
  'ca82c97dfa5947f0add4a2af9ca472c0',
  'b7fd9326363ff7cc34a5e5f171d83115',
  '04c723c31896059a071280e2eb27b275',
  '09832c1a1b6e5aa0523bd6b329e32f84',
  '53d100ed20fcb15b6acbbe394a4c58cf',
  'd0efaafb434d338545f9027f503c9fa8',
  '51a3408f929d38f5bcb6da2110fff3d2',
  'cd0c13ec5f974417c4a77e3d645d1973',
  '60814fdc222a908846eeb814de5e0bdb',
  'e0323a0a4906245cc2d3ac629195e479',
  'e7c8376d8dd54ea96c56f4ea657aae08',
  'ba78252e1ca6b4c6e8dd741f4bbd8b8a',
  '703eb5664803f60e613557b986c11d9e',
  'e1f8981169d98e949b1e87e9ce5528df',
  '8ca1890dbfe6426841992d0fb054bb16',
].join('');
const FIPS_SBOX = Array.from({ length: 256 }, (_, i) => parseInt(FIPS_SBOX_HEX.slice(2 * i, 2 * i + 2), 16));

function reassemble(bits: readonly { bit: number; result: number }[]): number {
  return bits.reduce((byte, step) => byte | (step.result << step.bit), 0);
}

describe('affine', () => {
  it('maps 0 to the affine constant and {ca} to {ed}', () => {
    expect(affine(0)).toBe(AFFINE_CONSTANT);
    expect(affine(0xca)).toBe(0xed);
  });
});

describe('affineSteps', () => {
  it('uses input bits [i, i+4, i+5, i+6, i+7] mod 8 and the constant bit', () => {
    const steps = affineSteps(0xca);
    expect(steps.map((step) => step.inputBits)).toEqual([
      [0, 4, 5, 6, 7],
      [1, 5, 6, 7, 0],
      [2, 6, 7, 0, 1],
      [3, 7, 0, 1, 2],
      [4, 0, 1, 2, 3],
      [5, 1, 2, 3, 4],
      [6, 2, 3, 4, 5],
      [7, 3, 4, 5, 6],
    ]);
    expect(steps.map((step) => step.constantBit)).toEqual([1, 1, 0, 0, 0, 1, 1, 0]);
    expect(steps[0]).toEqual({ bit: 0, inputBits: [0, 4, 5, 6, 7], inputValues: [0, 0, 0, 1, 1], constantBit: 1, result: 1 });
  });

  it('reassembles to affine(x) for all 256 bytes, with input values read from x', () => {
    for (const x of ALL_BYTES) {
      const steps = affineSteps(x);
      expect(reassemble(steps)).toBe(affine(x));
      steps.forEach((step) => expect(step.inputValues).toEqual(step.inputBits.map((position) => (x >> position) & 1)));
    }
  });
});

describe('sboxEntry', () => {
  it('matches the full FIPS 197 Figure 7 S-box', () => {
    expect(ALL_BYTES.map(sboxEntry)).toEqual(FIPS_SBOX);
    expect(sboxEntry(0x53)).toBe(0xed);
  });

  it('is affine(ginv(x)) and a permutation of all 256 bytes', () => {
    for (const x of ALL_BYTES) expect(sboxEntry(x)).toBe(affine(ginv(x)));
    expect(new Set(ALL_BYTES.map(sboxEntry)).size).toBe(256);
  });
});
