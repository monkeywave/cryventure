import { describe, expect, it } from 'vitest';
import { firstPrimes, integerRoot, rootWord, wordBytes, wordHex } from './primeRoots.ts';

describe('firstPrimes', () => {
  it('lists the first primes in order', () => expect(firstPrimes(10)).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]));
  it('ends at 311 (64th) and 409 (80th)', () => {
    expect(firstPrimes(64).at(-1)).toBe(311);
    expect(firstPrimes(80).at(-1)).toBe(409);
  });
  it('gives primes 9–16 as 23 … 53', () => expect(firstPrimes(16).slice(8)).toEqual([23, 29, 31, 37, 41, 43, 47, 53]));
});

describe('integerRoot', () => {
  it.each([
    [8n, 3, 2n],
    [27n, 3, 3n],
    [26n, 3, 2n],
    [28n, 3, 3n],
    [0n, 3, 0n],
    [1n, 2, 1n],
    [2n, 2, 1n],
    [15n, 2, 3n],
    [16n, 2, 4n],
    [17n, 2, 4n],
    [10n ** 30n, 3, 10n ** 10n],
    [10n ** 30n - 1n, 3, 10n ** 10n - 1n],
  ])('⌊%s^(1/%i)⌋ = %s', (n, k, root) => expect(integerRoot(n, k)).toBe(root));

  it('is the floor for every n < 2000 (k = 2, 3)', () => {
    for (let n = 0n; n < 2000n; n++) {
      for (const k of [2, 3]) {
        const root = integerRoot(n, k);
        const degree = BigInt(k);
        expect(root ** degree <= n && (root + 1n) ** degree > n).toBe(true);
      }
    }
  });

  it('rejects negative n and k < 2', () => {
    expect(() => integerRoot(-1n, 2)).toThrow(RangeError);
    expect(() => integerRoot(4n, 1)).toThrow(RangeError);
  });
});

describe('rootWord', () => {
  it('√2 · 2³² gives 1.6a09e667 (SHA-256 H0)', () => expect(rootWord(2, 2, 32)).toEqual({ integerPart: 1n, skipped: 0n, word: 0x6a09e667n }));
  it('∛2 gives 1.428a2f98 (SHA-256 K0)', () => expect(rootWord(2, 3, 32)).toEqual({ integerPart: 1n, skipped: 0n, word: 0x428a2f98n }));
  it('∛409 to 64 bits gives SHA-512 K79 = 6c44198c4a475817', () => expect(rootWord(409, 3, 64).word).toBe(0x6c44198c4a475817n));
  it('√23 to 64 bits is the SHA-384 H0 cbbb9d5dc1059ed8', () => expect(rootWord(23, 2, 64)).toEqual({ integerPart: 4n, skipped: 0n, word: 0xcbbb9d5dc1059ed8n }));
  it('√23 skipping 32 bits is the SHA-224 H0 c1059ed8 (skipped cbbb9d5d)', () => expect(rootWord(23, 2, 32, 32)).toEqual({ integerPart: 4n, skipped: 0xcbbb9d5dn, word: 0xc1059ed8n }));
});

describe('wordHex / wordBytes', () => {
  it('pads to the word size', () => expect(wordHex(0x6ca6351n, 32)).toBe('06ca6351'));
  it('splits big-endian', () => expect(wordBytes(0x0102030405060708n, 64)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]));
});
