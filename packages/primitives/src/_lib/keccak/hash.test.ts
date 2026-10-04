import { hashFunction, toHex, utf8Bytes, xofFunction } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { KECCAK_ALGORITHMS } from './algorithms.ts';
import { absorbedPrefix, customizationParts, isCustomized, KECCAK_HASH_FUNCTIONS, KECCAK_XOF_FUNCTIONS, keccakHashFamily, keccakOutput } from './hash.ts';

/** The package compiles without DOM/Node lib types; the test runner provides `performance`. */
const { performance } = globalThis as unknown as { performance: { now(): number } };
const family = keccakHashFamily('sha3');
const fn = (id: string) => hashFunction(family, id)!;
const xof = (id: string) => xofFunction(family, id)!;
const abc = utf8Bytes('abc');
const S = utf8Bytes('Email Signature');

describe('keccakHashFamily', () => {
  it('offers five functions and four XOFs with their rates and sizes', () => {
    expect(family.id).toBe('sha3');
    expect(KECCAK_HASH_FUNCTIONS.map((f) => [f.id, f.blockSize, f.outputSize])).toEqual([
      ['sha3-224', 144, 28],
      ['sha3-256', 136, 32],
      ['sha3-384', 104, 48],
      ['sha3-512', 72, 64],
      ['keccak-256', 136, 32],
    ]);
    expect(KECCAK_XOF_FUNCTIONS.map((x) => [x.id, x.blockSize, x.securityBits, x.customizable])).toEqual([
      ['shake128', 168, 128, false],
      ['shake256', 136, 256, false],
      ['cshake128', 168, 128, true],
      ['cshake256', 136, 256, true],
    ]);
  });

  it('hashes "abc" and "" to the known SHA3-256 / Keccak-256 values', () => {
    expect(toHex(fn('sha3-256').hash(abc))).toBe('3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
    expect(toHex(fn('keccak-256').hash(new Uint8Array(0)))).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });

  it('create() gives the same digest as hash()', () => {
    const context = fn('sha3-512').create();
    context.update(abc);
    expect(toHex(context.digest())).toBe(toHex(fn('sha3-512').hash(abc)));
  });

  it('cSHAKE128 reproduces SP 800-185 sample #1, through xof() and create()', () => {
    const expected = 'c1c36925b6409a04f1b504fcbca9d82b4017277cb5ed2b2065fc1d3814d5aaf5';
    const data = Uint8Array.of(0, 1, 2, 3);
    expect(toHex(xof('cshake128').xof(data, 32, { customization: S }))).toBe(expected);
    const context = xof('cshake128').create({ customization: S });
    context.update(data);
    expect(toHex(context.squeeze(32))).toBe(expected);
  });

  it('cSHAKE with N and S empty equals SHAKE (SP 800-185 §3.3)', () => {
    expect(toHex(xof('cshake256').xof(abc, 40, { functionName: new Uint8Array(0) }))).toBe(toHex(xof('shake256').xof(abc, 40)));
  });

  it('SHAKE refuses a non-empty N or S, in xof() and create()', () => {
    expect(() => xof('shake128').xof(abc, 16, { customization: S })).toThrow(RangeError);
    expect(() => xof('shake256').create({ functionName: S })).toThrow(RangeError);
  });
});

describe('helpers', () => {
  it('customizationParts and isCustomized treat absent parts as empty', () => {
    expect(customizationParts(undefined)).toEqual({ functionName: new Uint8Array(0), customization: new Uint8Array(0) });
    expect([isCustomized(undefined), isCustomized({ functionName: new Uint8Array(0) }), isCustomized({ customization: S })]).toEqual([false, false, true]);
  });

  it('absorbedPrefix is the bytepad prefix for cSHAKE only', () => {
    expect(absorbedPrefix(KECCAK_ALGORITHMS.cshake128, { customization: S }).length).toBe(168);
    expect(absorbedPrefix(KECCAK_ALGORITHMS['sha3-256'], undefined).length).toBe(0);
    expect(() => absorbedPrefix(KECCAK_ALGORITHMS['sha3-256'], { customization: S })).toThrow(RangeError);
  });

  it('keccakOutput rejects a bad output length', () => {
    expect(() => keccakOutput(KECCAK_ALGORITHMS.shake128, abc, -1)).toThrow(RangeError);
  });
});

describe('port speed budget (docs/M6.md §2a)', () => {
  it('hashes 1 KiB with SHA3-256 and squeezes 1 KiB of SHAKE128 in under 50 ms each', () => {
    const data = new Uint8Array(1024).fill(0x5a);
    fn('sha3-256').hash(data); // warm-up
    for (const work of [() => fn('sha3-256').hash(data), () => xof('shake128').xof(data, 1024)]) {
      const start = performance.now();
      work();
      expect(performance.now() - start).toBeLessThan(50);
    }
  });
});
