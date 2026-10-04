import { toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { blake2bCompress, blake2Digest, blake2Engine, blake2sCompress, BLAKE2B_ENGINE, BLAKE2S_ENGINE, checkBlake2Sizes } from './reference.ts';

/** RFC 7693 Appendix A/B and the well-known empty-message digests (BLAKE2 reference implementation). */
const ABC = utf8Bytes('abc');
const BLAKE2B_512_ABC = 'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923';
const BLAKE2S_256_ABC = '508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982';
const BLAKE2B_512_EMPTY = '786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce';
const BLAKE2S_256_EMPTY = '69217a3079908094e11121d042354a7c1f55b6482ca1a51e1b250dfd1ed0eef9';
/** blake2s-kat.txt / blake2b-kat.txt (CC0): key 00 01 …, message 00 01 02. */
const KEYED_S_3 = '1d220dbe2ee134661fdf6d9e74b41704710556f2f6e5a091b227697445dbea6b';
const KEYED_B_3 = '33d0825dddf7ada99b0e7e307104ad07ca9cfd9692214f1561356315e784f3e5a17e364ae9dbb14cb2036df932b77f4b292761365fb328de7afdc6d8998f5fc1';

/** The test runner's clock (the primitives typecheck without DOM or Node types). */
const { performance } = globalThis as unknown as { performance: { now(): number } };

const sequence = (length: number) => Uint8Array.from({ length }, (_, index) => index & 0xff);

/** RFC 7693 Appendix E: `selftest_seq`, a Fibonacci generator seeded with a = 0xDEAD4BAD · seed. */
function selftestSequence(length: number, seed: number): Uint8Array {
  let a = Math.imul(0xdead4bad, seed) >>> 0;
  let b = 1;
  return Uint8Array.from({ length }, () => {
    const t = (a + b) >>> 0;
    a = b;
    b = t;
    return t >>> 24;
  });
}

/** RFC 7693 Appendix E: the 32-byte grand hash over unkeyed and keyed digests of all lengths. */
function grandHash(flavour: 'blake2s' | 'blake2b', mdLengths: readonly number[], inLengths: readonly number[]): string {
  const digests: number[] = [];
  for (const outlen of mdLengths) {
    for (const inlen of inLengths) {
      const input = selftestSequence(inlen, inlen);
      digests.push(...blake2Digest(flavour, outlen, input));
      digests.push(...blake2Digest(flavour, outlen, input, selftestSequence(outlen, outlen)));
    }
  }
  return toHex(blake2Digest(flavour, 32, Uint8Array.from(digests)));
}

describe('blake2Digest (RFC 7693)', () => {
  it('matches Appendix A (BLAKE2b-512 "abc") and Appendix B (BLAKE2s-256 "abc")', () => {
    expect(toHex(blake2Digest('blake2b', 64, ABC))).toBe(BLAKE2B_512_ABC);
    expect(toHex(blake2Digest('blake2s', 32, ABC))).toBe(BLAKE2S_256_ABC);
  });

  it('compresses one all-zero block for the empty unkeyed message', () => {
    expect(toHex(blake2Digest('blake2s', 32, new Uint8Array()))).toBe(BLAKE2S_256_EMPTY);
    expect(toHex(blake2Digest('blake2b', 64, new Uint8Array()))).toBe(BLAKE2B_512_EMPTY);
  });

  it('prepends the zero-padded key as block 0 (reference KATs)', () => {
    expect(toHex(blake2Digest('blake2s', 32, sequence(3), sequence(32)))).toBe(KEYED_S_3);
    expect(toHex(blake2Digest('blake2b', 64, sequence(3), sequence(64)))).toBe(KEYED_B_3);
  });

  it('reproduces the Appendix E self-test grand hashes (lengths 0 … 1024, keyed and unkeyed)', () => {
    expect(grandHash('blake2b', [20, 32, 48, 64], [0, 3, 128, 129, 255, 1024])).toBe('c23a7800d98123bd10f506c61e29da5603d763b8bbad2e737f5e765a7bccd475');
    expect(grandHash('blake2s', [16, 20, 28, 32], [0, 3, 64, 65, 255, 1024])).toBe('6a411f08ce25adcdfb02aba641451cec53c598b24f4fc787fbdc88797f4c1dfe');
  });

  it('makes nn part of the hash: a shorter digest is not a truncation (parameter word 0)', () => {
    expect(toHex(blake2Digest('blake2b', 32, ABC))).not.toBe(BLAKE2B_512_ABC.slice(0, 64));
  });

  it('rejects digest lengths outside 1 … nn max and over-long keys', () => {
    expect(() => blake2Digest('blake2s', 0, ABC)).toThrow(RangeError);
    expect(() => blake2Digest('blake2s', 33, ABC)).toThrow(RangeError);
    expect(() => blake2Digest('blake2s', 32, ABC, new Uint8Array(33))).toThrow(RangeError);
    expect(() => blake2Digest('blake2b', 64, ABC, new Uint8Array(64))).not.toThrow();
    expect(() => checkBlake2Sizes(BLAKE2B_ENGINE, 64.5, 0)).toThrow(RangeError);
  });

  it('stays within the port-speed budget: 1 KiB in < 50 ms per flavour (docs/M6.md §2a)', () => {
    const data = sequence(1024);
    for (const flavour of ['blake2s', 'blake2b'] as const) {
      blake2Digest(flavour, 32, data);
      const start = performance.now();
      blake2Digest(flavour, 32, data);
      expect(performance.now() - start, flavour).toBeLessThan(50);
    }
  });
});

describe('blake2 engines', () => {
  it('pick the flavour and expose its sizes', () => {
    expect(blake2Engine('blake2s')).toBe(BLAKE2S_ENGINE);
    expect(blake2Engine('blake2b')).toBe(BLAKE2B_ENGINE);
    expect([BLAKE2S_ENGINE.blockBytes, BLAKE2S_ENGINE.maxKeyBytes, BLAKE2B_ENGINE.blockBytes, BLAKE2B_ENGINE.maxKeyBytes]).toEqual([64, 32, 128, 64]);
  });

  it('start from IV ⊕ 0x0101kknn (Appendix B: h0 = 6b08e647 for nn = 32, kk = 0)', () => {
    expect(BLAKE2S_ENGINE.initialState(32, 0)[0]!.toString(16)).toBe('6b08e647');
    expect(BLAKE2S_ENGINE.initialState(32, 32)[0]!.toString(16)).toBe('6b08c647');
    expect(BLAKE2B_ENGINE.initialState(64, 0)[0]!.toString(16)).toBe('6a09e667f2bdc948');
  });

  it('serialise h little-endian (Appendix B: h0 = 8c5e8c50 starts the digest 50 8c 5e 8c)', () => {
    expect(toHex(BLAKE2S_ENGINE.bytes(Uint32Array.of(0x8c5e8c50, 0, 0, 0, 0, 0, 0, 0)).subarray(0, 4))).toBe('508c5e8c');
    expect(toHex(BLAKE2B_ENGINE.bytes(BigUint64Array.of(0x0d4d1c983fa580ban, 0n, 0n, 0n, 0n, 0n, 0n, 0n)).subarray(0, 8))).toBe('ba80a53f981c4d0d');
  });

  it('compress in place and differ for the final flag and the counter', () => {
    const block = new Uint8Array(64);
    const plain = blake2sCompress(BLAKE2S_ENGINE.initialState(32, 0), block, 0, false);
    const final = blake2sCompress(BLAKE2S_ENGINE.initialState(32, 0), block, 0, true);
    const counted = blake2sCompress(BLAKE2S_ENGINE.initialState(32, 0), block, 2 ** 32, true);
    expect(new Set([plain, final, counted].map((h) => toHex(BLAKE2S_ENGINE.bytes(h)))).size).toBe(3);
    const h = BLAKE2B_ENGINE.initialState(64, 0);
    expect(blake2bCompress(h, new Uint8Array(128), 0, true)).toBe(h);
    expect(toHex(BLAKE2B_ENGINE.bytes(h))).toBe(BLAKE2B_512_EMPTY);
  });
});
