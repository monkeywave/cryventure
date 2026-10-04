import { describe, expect, it } from 'vitest';
import { domainSuffix, effectiveDomain, isCustomizable, isXof, KECCAK_ALGORITHMS } from './algorithms.ts';
import { KECCAK_ALGORITHM_IDS } from './manifestKit.ts';
import { DOMAIN_SUFFIXES } from './padding.ts';

describe('KECCAK_ALGORITHMS (FIPS 202 §6, SP 800-185 §3)', () => {
  it('has one entry per id with rate r = 1600 − c', () => {
    expect(Object.keys(KECCAK_ALGORITHMS)).toEqual([...KECCAK_ALGORITHM_IDS]);
    const rates = KECCAK_ALGORITHM_IDS.map((id) => KECCAK_ALGORITHMS[id].rateBytes);
    expect(rates).toEqual([144, 136, 104, 72, 136, 168, 136, 168, 136]);
    for (const id of KECCAK_ALGORITHM_IDS) expect(KECCAK_ALGORITHMS[id].rateBytes * 8 + KECCAK_ALGORITHMS[id].capacityBits).toBe(1600);
  });

  it('gives the fixed-length functions a digest size and the XOFs none', () => {
    expect(KECCAK_ALGORITHMS['sha3-384'].outputSize).toBe(48);
    expect(isXof(KECCAK_ALGORITHMS['keccak-256'])).toBe(false);
    expect(isXof(KECCAK_ALGORITHMS.shake128)).toBe(true);
  });

  it('makes only cSHAKE customizable', () => {
    expect(KECCAK_ALGORITHM_IDS.filter((id) => isCustomizable(KECCAK_ALGORITHMS[id]))).toEqual(['cshake128', 'cshake256']);
  });

  it('pads cSHAKE without N and S as SHAKE', () => {
    expect(effectiveDomain(KECCAK_ALGORITHMS.cshake128, false)).toBe('shake');
    expect(effectiveDomain(KECCAK_ALGORITHMS.cshake128, true)).toBe('cshake');
    expect(effectiveDomain(KECCAK_ALGORITHMS['sha3-256'], false)).toBe('sha3');
    expect(domainSuffix('keccak')).toBe(DOMAIN_SUFFIXES.keccak);
  });
});
