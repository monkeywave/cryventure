import { toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { SHA1_FUNCTIONS, SHA1_IV, SHA1_K, sha1Compress, sha1Digest, sha1Padding, sha1PadTail, sha1RoundConstants, sha1Schedule, sha1ScheduleWord, sha1StateBytes } from './sha1.ts';

/** ⌊√n⌋ for a non-negative bigint, by Newton's method (exact integer arithmetic). */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

describe('SHA-1 constants', () => {
  it('isqrt is exact around perfect squares', () => {
    expect([isqrt(0n), isqrt(1n), isqrt(15n), isqrt(16n), isqrt(17n), isqrt((1n << 80n) - 1n)]).toEqual([0n, 1n, 3n, 4n, 4n, (1n << 40n) - 1n]);
  });

  it('K = ⌊2^30 · √n⌋ = ⌊√(n · 2^60)⌋ for n = 2, 3, 5, 10 (FIPS 180-4 §4.2.1)', () => {
    expect(SHA1_K.map(BigInt)).toEqual([2n, 3n, 5n, 10n].map((n) => isqrt(n << 60n)));
  });

  it('starts from H(0) = 67452301 efcdab89 98badcfe 10325476 c3d2e1f0 (§5.3.1)', () => {
    expect(toHex(sha1StateBytes(Uint32Array.from(SHA1_IV)))).toBe('67452301efcdab8998badcfe10325476c3d2e1f0');
  });
});

describe('sha1RoundConstants and f_t', () => {
  it.each([
    [0, 'ch', 0x5a827999],
    [19, 'ch', 0x5a827999],
    [20, 'parity', 0x6ed9eba1],
    [40, 'maj', 0x8f1bbcdc],
    [60, 'parity', 0xca62c1d6],
    [79, 'parity', 0xca62c1d6],
  ] as const)('round %i uses %s with K = %i', (t, fn, k) => {
    expect(sha1RoundConstants(t)).toEqual({ fn, k });
  });

  it('rejects rounds outside 0 … 79', () => {
    expect(() => sha1RoundConstants(80)).toThrow(RangeError);
  });

  it('computes Ch, Parity and Maj bitwise', () => {
    const [x, y, z] = [0xff00ff00, 0xf0f0f0f0, 0xcccccccc];
    expect(SHA1_FUNCTIONS.ch(x, y, z)).toBe(0xf0ccf0cc);
    expect(SHA1_FUNCTIONS.parity(x, y, z)).toBe(0xc33cc33c);
    expect(SHA1_FUNCTIONS.maj(x, y, z)).toBe(0xfcc0fcc0);
  });
});

describe('sha1Schedule', () => {
  it('W_t = ROTL^1(W_{t−3} ⊕ W_{t−8} ⊕ W_{t−14} ⊕ W_{t−16})', () => {
    const w = sha1Schedule(sha1Padding(utf8Bytes('abc')).padded);
    expect(w.length).toBe(80);
    expect(w[0]).toBe(0x61626380);
    // W16 = ROTL1(W13 ⊕ W8 ⊕ W2 ⊕ W0) = ROTL1(61626380) since W1 … W14 are zero.
    expect(w[16]).toBe(0xc2c4c700);
    expect(sha1ScheduleWord(w, 40)).toBe(w[40]);
  });
});

describe('sha1Padding', () => {
  it('is the SHA-2 padding with a big-endian length', () => {
    const { padded, zeroBytes } = sha1Padding(utf8Bytes('abc'));
    expect(zeroBytes).toBe(52);
    expect(toHex(padded.subarray(56))).toBe('0000000000000018');
    expect(toHex(sha1PadTail(utf8Bytes('ab'), 66).subarray(56))).toBe('0000000000000210');
  });
});

describe('sha1Compress and sha1Digest', () => {
  it.each([
    ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '84983e441c3bd26ebaae4aa1f95129e5e54670f1'],
  ])('SHA-1(%j) (FIPS 180-4 examples, CAVP)', (text, digest) => {
    expect(toHex(sha1Digest(utf8Bytes(text)))).toBe(digest);
  });

  it('updates the state in place', () => {
    const h = Uint32Array.from(SHA1_IV);
    expect(sha1Compress(h, sha1Padding(new Uint8Array(0)).padded)).toBe(h);
    expect(toHex(sha1StateBytes(h))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});
