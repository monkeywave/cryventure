import { describe, expect, it } from 'vitest';
import { BLAKE2_ALGORITHMS, BLAKE2B, BLAKE2S } from './variants.ts';

describe('BLAKE2 algorithms', () => {
  it('name each function as RFC 7693 does and pair it with its variant and digest length', () => {
    expect(Object.values(BLAKE2_ALGORITHMS).map(({ id, name, variant, outputSize }) => [id, name, variant.name, outputSize])).toEqual([
      ['blake2s-128', 'BLAKE2s-128', 'BLAKE2s', 16],
      ['blake2s-160', 'BLAKE2s-160', 'BLAKE2s', 20],
      ['blake2s-224', 'BLAKE2s-224', 'BLAKE2s', 28],
      ['blake2s-256', 'BLAKE2s-256', 'BLAKE2s', 32],
      ['blake2b-160', 'BLAKE2b-160', 'BLAKE2b', 20],
      ['blake2b-256', 'BLAKE2b-256', 'BLAKE2b', 32],
      ['blake2b-384', 'BLAKE2b-384', 'BLAKE2b', 48],
      ['blake2b-512', 'BLAKE2b-512', 'BLAKE2b', 64],
    ]);
  });

  it('BLAKE2s: 10 rounds, 64-byte blocks, rotations 16/12/8/7; BLAKE2b: 12, 128, 32/24/16/63 (RFC 7693 §2.1)', () => {
    expect([BLAKE2S.rounds, BLAKE2S.blockBytes, BLAKE2S.rotations]).toEqual([10, 64, [16, 12, 8, 7]]);
    expect([BLAKE2B.rounds, BLAKE2B.blockBytes, BLAKE2B.rotations]).toEqual([12, 128, [32, 24, 16, 63]]);
  });

  it('turn small integers into words of the variant', () => {
    expect(BLAKE2S.word(2 ** 32 + 1)).toBe(1);
    expect(BLAKE2B.word(7)).toBe(7n);
  });
});
