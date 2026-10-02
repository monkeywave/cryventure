import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import vectors from './vectors/fips197.json';
import {
  expandKey,
  isValidKeySize,
  keySchedule,
  rcon,
  rotWord,
  roundCount,
  roundKeyBytes,
  subWord,
} from './keyExpansion.ts';
import { hexBytes as bytes } from './testHelpers.ts';

describe('rotWord / subWord', () => {
  it('matches FIPS 197 App. A.1 (i = 4)', () => {
    expect(toHex(rotWord(bytes('09cf4f3c')))).toBe('cf4f3c09');
    expect(toHex(subWord(bytes('cf4f3c09')))).toBe('8a84eb01');
  });
});

describe('rcon', () => {
  it('produces the round constants x^(i-1)', () => {
    expect([1, 2, 8, 9, 10].map((i) => rcon(i)[0])).toEqual([0x01, 0x02, 0x80, 0x1b, 0x36]);
    expect(rcon(3)).toEqual([0x04, 0, 0, 0]);
  });
});

describe('isValidKeySize / roundCount', () => {
  it('accepts 16/24/32 bytes with 10/12/14 rounds', () => {
    expect([16, 24, 32].map(roundCount)).toEqual([10, 12, 14]);
    expect(isValidKeySize(20)).toBe(false);
    expect(() => roundCount(20)).toThrow(RangeError);
  });
});

describe('expandKey', () => {
  for (const expansion of vectors.keyExpansion) {
    it(`matches FIPS 197 ${expansion.section} spot words`, () => {
      const words = expandKey(bytes(expansion.key));
      expect(words).toHaveLength(expansion.totalWords);
      for (const [index, hex] of Object.entries(expansion.words)) {
        expect(toHex(words[Number(index)] ?? []), `w[${index}]`).toBe(hex);
      }
    });
  }
});

describe('roundKeyBytes', () => {
  it('returns App. B round keys 0, 1 and 10 for the App. B key', () => {
    const words = expandKey(bytes(vectors.appendixB.key));
    expect(toHex(roundKeyBytes(words, 0))).toBe(vectors.appendixB.key);
    expect(toHex(roundKeyBytes(words, 1))).toBe(vectors.appendixB.rounds[0]?.k_sch);
    expect(toHex(roundKeyBytes(words, 10))).toBe(vectors.appendixB.rounds[9]?.k_sch);
  });
});

describe('keySchedule', () => {
  it.each([
    [16, 4, 10],
    [24, 6, 12],
    [32, 8, 14],
  ])('a %i-byte key has Nk = %i, Nr = %i and the expandKey words', (length, keyWords, rounds) => {
    const key = Array.from({ length }, (_, i) => i);
    expect(keySchedule(key)).toEqual({ keyWords, rounds, words: expandKey(key) });
  });
});
