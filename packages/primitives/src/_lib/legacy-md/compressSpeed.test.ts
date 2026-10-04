import { describe, expect, it } from 'vitest';
import { MD5_IV, md5Compress, md5CompressSpec } from './md5.ts';
import { SHA1_IV, sha1Compress, sha1CompressSpec } from './sha1.ts';

/**
 * docs/M7.md §2e: the ports' MD5 and SHA-1 compressions (int32, flat tables) equal the spec-shaped
 * references and are fast enough for PBKDF2 at 100000 iterations.
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

/** Mean µs per call of `run` over `count` calls, after a warm-up. */
function microsPerCall(run: () => void, count: number): number {
  for (let i = 0; i < count / 4; i++) run();
  const start = performance.now();
  for (let i = 0; i < count; i++) run();
  return ((performance.now() - start) * 1000) / count;
}

type Compress = (h: Uint32Array, block: Uint8Array) => Uint32Array;

const CASES: readonly [string, readonly number[], Compress, Compress][] = [
  ['md5', MD5_IV, md5Compress, md5CompressSpec],
  ['sha-1', SHA1_IV, sha1Compress, sha1CompressSpec],
];

describe.each(CASES)('%s port compression', (_name, iv, fast, spec) => {
  it('equals the spec-shaped compression over a chain of random blocks (some at an odd offset)', () => {
    const data = randomBytes(64 * 200 + 1, 7);
    const hFast = Uint32Array.from(iv);
    const hSpec = Uint32Array.from(iv);
    for (let n = 0; n < 200; n++) {
      const block = data.subarray(64 * n + (n % 2), 64 * n + (n % 2) + 64);
      expect(fast(hFast, block)).toBe(hFast);
      spec(hSpec, block);
      expect([...hFast]).toEqual([...hSpec]);
    }
  });

  it('is much faster than the spec-shaped compression (target ≤ 2.5 µs; asserted ≥ 3× so it does not flake)', () => {
    const block = randomBytes(64, 42);
    const before = microsPerCall(() => spec(Uint32Array.from(iv), block), 4000);
    const h = Uint32Array.from(iv);
    const after = microsPerCall(() => fast(h, block), 40000);
    const measured = `spec ${before.toFixed(2)} µs, port ${after.toFixed(2)} µs per compression: ${(before / after).toFixed(1)}×`;
    // Measured about 55× for MD5 (25.6 → 0.46 µs) and 33× for SHA-1 (14.6 → 0.44 µs) on an M-series Mac.
    expect(before / after, measured).toBeGreaterThanOrEqual(3);
  });
});
