import { describe, expect, it } from 'vitest';
import { SHA512_ALGORITHMS } from './algorithms.ts';
import { SHA512_IV } from './constants.ts';
import { sha2Digest, sha2PortDigest } from './hash.ts';
import { fromHiLo, sha512CompressHiLo, toHiLo } from './hilo.ts';
import { sha512Compress } from './reference.ts';

/**
 * docs/M7.md §2a: the hi/lo SHA-512 compression equals the `bigint` reference and is much faster.
 * The CAVP ShortMsg sets (all 4 × 129 cases) run through the port in `sha512/module.test.ts`
 * ("run() and ports.Hash"), next to the traced `bigint` path; `_lib` may not import producer files.
 */

/** The package compiles without DOM/Node lib types; the test runner provides `performance`. */
const { performance } = globalThis as unknown as { performance: { now(): number } };

/** A deterministic pseudo-random byte stream (xorshift32), so failures reproduce. */
function randomBytes(length: number, seed: number): Uint8Array {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length }, () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x & 0xff;
  });
}

const randomWords = (seed: number): bigint[] => {
  const bytes = randomBytes(64, seed);
  const view = new DataView(bytes.buffer);
  return Array.from({ length: 8 }, (_, i) => view.getBigUint64(i * 8));
};

describe('toHiLo / fromHiLo', () => {
  it('round-trip 64-bit words, high half first', () => {
    const words = [0n, 1n, 0xffffffffn, 0x100000000n, 0xffffffffffffffffn, 0x0123456789abcdefn];
    expect(fromHiLo(toHiLo(words))).toEqual(words);
    expect(Array.from(toHiLo([0x0123456789abcdefn]))).toEqual([0x01234567, 0x89abcdef]);
  });
});

describe('sha512CompressHiLo', () => {
  it('equals sha512Compress on random states and blocks', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const words = randomWords(seed * 7919);
      const block = randomBytes(128, seed);
      expect(fromHiLo(sha512CompressHiLo(toHiLo(words), block))).toEqual(Array.from(sha512Compress(BigUint64Array.from(words), block)));
    }
  });

  it('equals sha512Compress on all-ones state and block (every carry set)', () => {
    const ones = new Array<bigint>(8).fill(0xffffffffffffffffn);
    const block = new Uint8Array(128).fill(0xff);
    expect(fromHiLo(sha512CompressHiLo(toHiLo(ones), block))).toEqual(Array.from(sha512Compress(BigUint64Array.from(ones), block)));
  });

  it('updates its argument in place and reads a block at a non-zero offset', () => {
    const buffer = new Uint8Array(5 + 128);
    buffer.set(randomBytes(128, 3), 5);
    const hl = toHiLo(SHA512_IV);
    expect(sha512CompressHiLo(hl, buffer.subarray(5))).toBe(hl);
    expect(fromHiLo(hl)).toEqual(Array.from(sha512Compress(BigUint64Array.from(SHA512_IV), randomBytes(128, 3))));
  });
});

describe('sha2PortDigest (the SHA-512 family on hi/lo)', () => {
  it.each(Object.values(SHA512_ALGORITHMS).map((algorithm) => [algorithm.id, algorithm] as const))('%s equals the bigint sha2Digest on random messages of every length 0 … 300 bytes', (_id, algorithm) => {
    for (let length = 0; length <= 300; length++) {
      const data = randomBytes(length, length + 1);
      expect(sha2PortDigest(algorithm, data)).toEqual(sha2Digest(algorithm, data));
    }
  });
});

/**
 * The speed-up a test asserts: the spec's `target` under `CV_PERF=1` (a quiet machine), else the loose
 * `flakeGuard` so a loaded CI machine does not flake. Reads the env without Node types.
 */
function requiredSpeedup(target: number, flakeGuard: number): number {
  const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env;
  return env?.['CV_PERF'] === '1' ? target : flakeGuard;
}

/** Mean µs per call of `run` over `count` calls, after a warm-up. */
function microsPerCall(run: () => void, count: number): number {
  for (let i = 0; i < count / 4; i++) run();
  const start = performance.now();
  for (let i = 0; i < count; i++) run();
  return ((performance.now() - start) * 1000) / count;
}

describe('port speed', () => {
  it('hi/lo is much faster than the bigint compression (≥ 10× under CV_PERF=1, else ≥ 4× so it does not flake)', () => {
    const block = randomBytes(128, 42);
    const big = BigUint64Array.from(SHA512_IV);
    const hl = toHiLo(SHA512_IV);
    const bigint = microsPerCall(() => sha512Compress(big, block), 2000);
    const hiLo = microsPerCall(() => sha512CompressHiLo(hl, block), 20000);
    const measured = `bigint ${bigint.toFixed(2)} µs, hi/lo ${hiLo.toFixed(2)} µs per compression: ${(bigint / hiLo).toFixed(1)}×`;
    // Measured about 30× (bigint ≈ 68 µs, hi/lo ≈ 2.2 µs) on an M-series Mac; 4× keeps a loaded CI machine from flaking.
    expect(bigint / hiLo, measured).toBeGreaterThanOrEqual(requiredSpeedup(10, 4));
  });
});
