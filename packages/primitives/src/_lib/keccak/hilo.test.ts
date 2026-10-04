import { toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { KECCAK_ALGORITHMS } from './algorithms.ts';
import { absorbHiLo, fromHiLoState, hiLoStateBytes, keccakF1600HiLo, toHiLoState, zeroHiLoState } from './hilo.ts';
import { stateBytes, zeroState } from './lanes.ts';
import { DOMAIN_SUFFIXES } from './padding.ts';
import { spongeHiLo } from './portSponge.ts';
import { absorbBlock, sponge } from './sponge.ts';
import { keccakF1600 } from './stepMappings.ts';

/**
 * docs/M7.md §2a: the hi/lo Keccak-f[1600] of the `Hash` port equals the `bigint` permutation the
 * traced recordings use, and is much faster. The CAVP SHA-3 / SHAKE / cSHAKE sets run through the
 * port in `sha3/module.test.ts`; `_lib` may not import producer files.
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

const randomLanes = (seed: number): bigint[] => {
  const view = new DataView(randomBytes(200, seed).buffer);
  return Array.from({ length: 25 }, (_, i) => view.getBigUint64(i * 8, true));
};

/** The SHA3-256 Msg0 state after absorbing 06 … 80 (FIPS 202 example SHA3-256_Msg0). */
function msg0Absorbed(): bigint[] {
  const state = zeroState();
  state[0] = 0x06n;
  state[16] = 0x8000000000000000n;
  return state;
}

describe('toHiLoState / fromHiLoState / hiLoStateBytes', () => {
  it('round-trip lanes, low half first, and write FIPS 202 byte order', () => {
    const lanes = randomLanes(5);
    lanes[0] = 0x0123456789abcdefn;
    const state = toHiLoState(lanes);
    expect(fromHiLoState(state)).toEqual(lanes);
    expect([state[0], state[1]]).toEqual([0x89abcdef, 0x01234567]);
    expect(Array.from(hiLoStateBytes(state))).toEqual(stateBytes(lanes));
    expect(Array.from(hiLoStateBytes(state, 13))).toEqual(stateBytes(lanes).slice(0, 13));
  });

  it('absorbHiLo equals absorbBlock and rejects a partial lane', () => {
    const lanes = randomLanes(9);
    const block = randomBytes(136, 4);
    expect(fromHiLoState(absorbHiLo(toHiLoState(lanes), block))).toEqual(absorbBlock(lanes, block));
    expect(() => absorbHiLo(zeroHiLoState(), new Uint8Array(7))).toThrow(RangeError);
  });
});

describe('keccakF1600HiLo', () => {
  it('equals the bigint keccakF1600 on 256 random states', () => {
    for (let seed = 1; seed <= 256; seed++) {
      const lanes = randomLanes(seed * 7919);
      expect(fromHiLoState(keccakF1600HiLo(toHiLoState(lanes))), `seed ${seed}`).toEqual(keccakF1600(lanes));
    }
  });

  it('equals keccakF1600 on the all-ones state and on iterated application', () => {
    const ones = new Array<bigint>(25).fill(0xffffffffffffffffn);
    expect(fromHiLoState(keccakF1600HiLo(toHiLoState(ones)))).toEqual(keccakF1600(ones));
    let lanes = zeroState();
    const state = zeroHiLoState();
    for (let i = 0; i < 10; i++) {
      lanes = keccakF1600(lanes);
      keccakF1600HiLo(state);
    }
    expect(fromHiLoState(state)).toEqual(lanes);
  });

  it('gives the Keccak team KeccakF-1600 zero-state lane f1258f7940e1dde7 and the FIPS 202 SHA3-256 Msg0 digest', () => {
    expect(fromHiLoState(keccakF1600HiLo(zeroHiLoState()))[0]!.toString(16)).toBe('f1258f7940e1dde7');
    const digest = hiLoStateBytes(keccakF1600HiLo(toHiLoState(msg0Absorbed())), 32);
    expect(toHex(digest)).toBe('a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
    expect(Array.from(digest)).toEqual(stateBytes(keccakF1600(msg0Absorbed())).slice(0, 32));
  });

  it('works in place and rejects a wrong word count', () => {
    const state = zeroHiLoState();
    expect(keccakF1600HiLo(state)).toBe(state);
    expect(() => keccakF1600HiLo(new Uint32Array(48))).toThrow(RangeError);
  });
});

describe('spongeHiLo', () => {
  it('equals the bigint sponge for every algorithm on messages of 0 … 400 bytes (multi-block squeeze included)', () => {
    for (const algorithm of Object.values(KECCAK_ALGORITHMS)) {
      const suffix = DOMAIN_SUFFIXES[algorithm.domain];
      const outputLength = algorithm.outputSize ?? 2 * algorithm.rateBytes + 5;
      for (let length = 0; length <= 400; length += 23) {
        const data = randomBytes(length, length + 1);
        expect(toHex(spongeHiLo(data, algorithm.rateBytes, suffix, outputLength)), `${algorithm.id} ${length}`).toBe(toHex(sponge(data, algorithm.rateBytes, suffix, outputLength)));
      }
    }
  });

  it('gives the FIPS 202 SHA3-256("") and SHAKE128("") values', () => {
    expect(toHex(spongeHiLo(new Uint8Array(0), 136, DOMAIN_SUFFIXES.sha3, 32))).toBe('a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
    expect(toHex(spongeHiLo(new Uint8Array(0), 168, DOMAIN_SUFFIXES.shake, 16))).toBe('7f9c2ba4e88f827d616045507605853e');
  });
});

/** Mean µs per call of `run` over `count` calls, after a warm-up. */
function microsPerCall(run: () => void, count: number): number {
  for (let i = 0; i < count / 4; i++) run();
  const start = performance.now();
  for (let i = 0; i < count; i++) run();
  return ((performance.now() - start) * 1000) / count;
}

describe('port speed', () => {
  it('hi/lo is much faster than the bigint permutation (PBKDF2-HMAC-SHA3 budget, docs/M7.md §2e; asserted ≥ 10× so it does not flake)', () => {
    const lanes = randomLanes(42);
    const state = toHiLoState(lanes);
    const bigint = microsPerCall(() => keccakF1600(lanes), 400);
    const hiLo = microsPerCall(() => keccakF1600HiLo(state), 20000);
    const measured = `bigint ${bigint.toFixed(2)} µs, hi/lo ${hiLo.toFixed(2)} µs per permutation: ${(bigint / hiLo).toFixed(1)}×`;
    // Measured about 90× (bigint ≈ 215 µs, hi/lo ≈ 2.4 µs) on an M-series Mac; 10× leaves a loaded CI machine ample margin.
    expect(bigint / hiLo, measured).toBeGreaterThanOrEqual(10);
  });
});
