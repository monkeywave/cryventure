import { describe, expect, it } from 'vitest';
import { SHA256_IV, SHA512_IV } from '../sha2/constants.ts';
import { BLAKE2B_IV, BLAKE2S_IV, G_POSITIONS, parameterWord0, SIGMA } from './constants.ts';

describe('BLAKE2 constants', () => {
  it('the IVs are the SHA-256 and SHA-512 initial hash values (RFC 7693 §2.6)', () => {
    expect(BLAKE2S_IV).toEqual(SHA256_IV);
    expect(BLAKE2B_IV).toEqual(SHA512_IV);
  });

  it('σ has ten rows, each a permutation of 0 … 15; σ[0] is the identity', () => {
    expect(SIGMA).toHaveLength(10);
    for (const row of SIGMA) expect([...row].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
    expect(SIGMA[0]).toEqual([...Array(16).keys()]);
  });

  it('G runs on the four columns, then the four diagonals of the 4 × 4 matrix', () => {
    for (let i = 0; i < 4; i++) expect(G_POSITIONS[i]).toEqual([i, i + 4, i + 8, i + 12]);
    for (let i = 0; i < 4; i++) expect(G_POSITIONS[4 + i]).toEqual([i, 4 + ((i + 1) % 4), 8 + ((i + 2) % 4), 12 + ((i + 3) % 4)]);
  });

  it('parameter word 0 is 0x0101kknn', () => {
    expect(parameterWord0(32, 0)).toBe(0x01010020);
    expect(parameterWord0(64, 64)).toBe(0x01014040);
  });
});
