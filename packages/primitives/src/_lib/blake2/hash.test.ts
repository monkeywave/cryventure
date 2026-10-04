import { hashFunction, toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { BLAKE2_FUNCTIONS, blake2Hash, blake2HashFamily } from './hash.ts';
import { BLAKE2_IDS } from './manifestKit.ts';
import { blake2Digest } from './reference.ts';

describe('BLAKE2 hash functions', () => {
  it('offers the eight RFC 7693 §4 functions with their block and digest sizes', () => {
    expect(BLAKE2_FUNCTIONS.map((fn) => [fn.id, fn.blockSize, fn.outputSize])).toEqual([
      ['blake2s-128', 64, 16],
      ['blake2s-160', 64, 20],
      ['blake2s-224', 64, 28],
      ['blake2s-256', 64, 32],
      ['blake2b-160', 128, 20],
      ['blake2b-256', 128, 32],
      ['blake2b-384', 128, 48],
      ['blake2b-512', 128, 64],
    ]);
  });

  it('hash() and create() agree with the one-shot reference', () => {
    const data = utf8Bytes('abc');
    for (const fn of BLAKE2_FUNCTIONS) {
      const flavour = fn.id.startsWith('blake2s') ? 'blake2s' : 'blake2b';
      const context = fn.create();
      context.update(data);
      expect(toHex(fn.hash(data)), fn.id).toBe(toHex(blake2Digest(flavour, fn.outputSize, data)));
      expect(context.digest(), fn.id).toEqual(fn.hash(data));
    }
  });

  it('blake2Hash takes an optional key', () => {
    const key = Uint8Array.of(1, 2, 3);
    expect(blake2Hash('blake2b-256', utf8Bytes('abc'), key)).toEqual(blake2Digest('blake2b', 32, utf8Bytes('abc'), key));
    expect(toHex(blake2Hash('blake2s-256', utf8Bytes('abc')))).toBe('508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982');
  });

  it('blake2HashFamily names the family after the producer and finds every id', () => {
    const family = blake2HashFamily('blake2');
    expect(family.id).toBe('blake2');
    for (const id of BLAKE2_IDS) expect(hashFunction(family, id)?.id).toBe(id);
  });
});
