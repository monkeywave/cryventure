import { describe, expect, it } from 'vitest';
import { add32, hex32, rotl32, wordsFromBytes, wordsHex, wordsToBytes, wordToBytes } from './words.ts';

describe('legacy-md words', () => {
  it('adds modulo 2^32', () => {
    expect(add32(0xffffffff, 1)).toBe(0);
    expect(add32(0x80000000, 0x80000000, 5)).toBe(5);
    expect(add32()).toBe(0);
  });

  it('rotates left', () => {
    expect(rotl32(0x80000001, 1)).toBe(0x00000003);
    expect(rotl32(0x12345678, 8)).toBe(0x34567812);
    expect(rotl32(0x12345678, 0)).toBe(0x12345678);
  });

  it('writes eight lowercase hex digits per word', () => {
    expect(hex32(0x1a)).toBe('0000001a');
    expect(wordsHex([0x67452301, 0xefcdab89])).toBe('67452301 efcdab89');
    expect(wordsHex([1, 2], '')).toBe('0000000100000002');
  });

  it('maps words to bytes and back in both byte orders', () => {
    expect(wordToBytes(0x67452301, 'big')).toEqual([0x67, 0x45, 0x23, 0x01]);
    expect(wordToBytes(0x67452301, 'little')).toEqual([0x01, 0x23, 0x45, 0x67]);
    const words = [0x67452301, 0xefcdab89];
    for (const order of ['big', 'little'] as const) expect(wordsFromBytes(wordsToBytes(words, order), order)).toEqual(words);
    expect(wordsFromBytes([0x61, 0x62, 0x63, 0x80], 'little')).toEqual([0x80636261]);
  });
});
