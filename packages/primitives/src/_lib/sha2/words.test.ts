import { describe, expect, it } from 'vitest';
import { WORD32, WORD64, wordsFromBytes, wordsHex, wordsToBytes } from './words.ts';

describe('WORD32', () => {
  it('xors, ands and nots as unsigned 32-bit words', () => {
    expect(WORD32.xor(0x80000000, 1)).toBe(0x80000001);
    expect(WORD32.and(0xffffffff, 0x80000000)).toBe(0x80000000);
    expect(WORD32.not(0x0f0f0f0f)).toBe(0xf0f0f0f0);
  });

  it('adds any number of words modulo 2^32 (zero words sum to 0)', () => {
    expect(WORD32.add()).toBe(0);
    expect(WORD32.add(0x80000000, 0x80000000, 5)).toBe(5);
  });

  it('reads and writes big-endian, treating missing bytes as zero', () => {
    expect(WORD32.fromBytes([0xde, 0xad, 0xbe, 0xef], 0)).toBe(0xdeadbeef);
    expect(WORD32.fromBytes([0xde, 0xad], 0)).toBe(0xdead0000);
    expect(WORD32.toBytes(0x01020304)).toEqual([1, 2, 3, 4]);
    expect(WORD32.toHex(0xab)).toBe('000000ab');
  });
});

describe('WORD64', () => {
  it('rotates, shifts and ands 64-bit words', () => {
    expect(WORD64.rotr(0x8000000000000001n, 4)).toBe(0x1800000000000000n);
    expect(WORD64.shr(0x8000000000000000n, 63)).toBe(1n);
    expect(WORD64.and(0xffn, 0x0fn)).toBe(0x0fn);
    expect(WORD64.xor(0xf0n, 0xffn)).toBe(0x0fn);
  });

  it('reads and writes big-endian, padded to 16 hex digits', () => {
    expect(WORD64.fromBytes([0, 1, 2, 3, 4, 5, 6, 7, 8], 1)).toBe(0x0102030405060708n);
    expect(WORD64.toBytes(0x0102030405060708n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(WORD64.toHex(1n)).toBe('0000000000000001');
  });
});

describe('word lists', () => {
  it('drops a trailing partial word and joins hex with a chosen separator', () => {
    expect(wordsFromBytes(WORD32, [0, 0, 0, 1, 0, 0])).toEqual([1]);
    expect(wordsHex(WORD32, [1, 2], '')).toBe('0000000100000002');
    expect(wordsToBytes(WORD64, [])).toEqual([]);
  });
});
