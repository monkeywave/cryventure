import { hashFunction, toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { MD5_FAMILY, MD5_FUNCTION, SHA1_FAMILY, SHA1_FUNCTION } from './hash.ts';

/** The package compiles without DOM/Node lib types; the test runner provides `performance`. */
const { performance } = globalThis as unknown as { performance: { now(): number } };

describe('legacy-md hash functions', () => {
  it('declare the ids and sizes of docs/M6.md §2e', () => {
    expect([MD5_FUNCTION.id, MD5_FUNCTION.blockSize, MD5_FUNCTION.outputSize]).toEqual(['md5', 64, 16]);
    expect([SHA1_FUNCTION.id, SHA1_FUNCTION.blockSize, SHA1_FUNCTION.outputSize]).toEqual(['sha-1', 64, 20]);
  });

  it('form the families md5 {md5} and sha1 {sha-1}', () => {
    expect(MD5_FAMILY.id).toBe('md5');
    expect(SHA1_FAMILY.id).toBe('sha1');
    expect(hashFunction(MD5_FAMILY, 'md5')).toBe(MD5_FUNCTION);
    expect(hashFunction(SHA1_FAMILY, 'sha-1')).toBe(SHA1_FUNCTION);
    expect(hashFunction(SHA1_FAMILY, 'md5')).toBeUndefined();
  });

  it('hash "abc"', () => {
    expect(toHex(MD5_FUNCTION.hash(utf8Bytes('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(toHex(SHA1_FUNCTION.hash(utf8Bytes('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('hash 1 KiB in well under 50 ms (port-speed budget, docs/M6.md §2a)', () => {
    const data = new Uint8Array(1024).fill(0x5a);
    for (const fn of [MD5_FUNCTION, SHA1_FUNCTION]) {
      fn.hash(data);
      const start = performance.now();
      fn.hash(data);
      expect(performance.now() - start).toBeLessThan(50);
    }
  });
});
