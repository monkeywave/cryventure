import { describe, expect, it } from 'vitest';
import { SHA256_PARAMS, SHA512_PARAMS } from './algorithms.ts';
import { bigSigma, ch, maj, smallSigma } from './functions.ts';
import { WORD32, WORD64 } from './words.ts';

const R256 = SHA256_PARAMS.rotations;
const R512 = SHA512_PARAMS.rotations;

describe('Σ and σ on the single bit x = 1 (each set bit is one rotation or shift, FIPS 180-4 §4.1.2, §4.1.3)', () => {
  it('32-bit: Σ0 = ROTR2 ⊕ ROTR13 ⊕ ROTR22, Σ1 = ROTR6 ⊕ ROTR11 ⊕ ROTR25', () => {
    expect(bigSigma(WORD32, 1, R256.Sigma0)).toBe(0x40080400); // bits 30, 19, 10
    expect(bigSigma(WORD32, 1, R256.Sigma1)).toBe(0x04200080); // bits 26, 21, 7
  });

  it('32-bit: σ0 = ROTR7 ⊕ ROTR18 ⊕ SHR3, σ1 = ROTR17 ⊕ ROTR19 ⊕ SHR10 (the shift drops the bit)', () => {
    expect(smallSigma(WORD32, 1, R256.sigma0)).toBe(0x02004000); // bits 25, 14
    expect(smallSigma(WORD32, 1, R256.sigma1)).toBe(0x0000a000); // bits 15, 13
  });

  it('64-bit: Σ0 = ROTR28 ⊕ ROTR34 ⊕ ROTR39, Σ1 = ROTR14 ⊕ ROTR18 ⊕ ROTR41', () => {
    expect(bigSigma(WORD64, 1n, R512.Sigma0)).toBe(0x0000001042000000n); // bits 36, 30, 25
    expect(bigSigma(WORD64, 1n, R512.Sigma1)).toBe(0x0004400000800000n); // bits 50, 46, 23
  });

  it('64-bit: σ0 = ROTR1 ⊕ ROTR8 ⊕ SHR7, σ1 = ROTR19 ⊕ ROTR61 ⊕ SHR6', () => {
    expect(smallSigma(WORD64, 1n, R512.sigma0)).toBe(0x8100000000000000n); // bits 63, 56
    expect(smallSigma(WORD64, 1n, R512.sigma1)).toBe(0x0000200000000008n); // bits 45, 3
  });

  it('σ keeps a high bit that SHR shifts down, unlike a rotation', () => {
    expect(smallSigma(WORD32, 0x80000000, [1, 2, 31])).toBe(0x40000000 ^ 0x20000000 ^ 1);
  });
});

describe('Ch and Maj (FIPS 180-4 §4.1.2)', () => {
  it('Ch: x picks y where it is 1 and z where it is 0', () => {
    expect(ch(WORD32, 0xffff0000, 0x12345678, 0x9abcdef0)).toBe(0x1234def0);
    expect(ch(WORD64, 0xffffffff00000000n, 0x0123456789abcdefn, 0xfedcba9876543210n)).toBe(0x0123456776543210n);
  });

  it('Maj: two equal arguments win; with a zero argument it is the AND of the others', () => {
    expect(maj(WORD32, 0x12345678, 0x12345678, 0x9abcdef0)).toBe(0x12345678);
    expect(maj(WORD32, 0xff00ff00, 0x0ff00ff0, 0)).toBe(0x0f000f00);
    expect(maj(WORD64, 0xf0f0f0f0f0f0f0f0n, 0xffffffff00000000n, 0x00000000ffffffffn)).toBe(0xf0f0f0f0f0f0f0f0n);
  });
});

describe('the SHA-256 and SHA-512 round-0 values of the FIPS 180-4 "abc" examples (a … h = H(0))', () => {
  it('32-bit: Σ1(e), Ch(e, f, g), Σ0(a), Maj(a, b, c)', () => {
    const [a, b, c, , e, f, g] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab] as const;
    expect(bigSigma(WORD32, e, R256.Sigma1)).toBe(0x3587272b);
    expect(ch(WORD32, e, f, g)).toBe(0x1f85c98c);
    expect(bigSigma(WORD32, a, R256.Sigma0)).toBe(0xce20b47e);
    expect(maj(WORD32, a, b, c)).toBe(0x3a6fe667);
  });

  it('64-bit: Σ1(e), Ch(e, f, g), Σ0(a), Maj(a, b, c)', () => {
    const [a, b, c, e, f, g] = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn] as const;
    expect(bigSigma(WORD64, e, R512.Sigma1)).toBe(0x9427e33bb5c9dbcan);
    expect(ch(WORD64, e, f, g)).toBe(0x1f85c98c7b273d3bn);
    expect(bigSigma(WORD64, a, R512.Sigma0)).toBe(0x08c4db56aac80c2an);
    expect(maj(WORD64, a, b, c)).toBe(0x3a6fe667f69ce92bn);
  });
});
