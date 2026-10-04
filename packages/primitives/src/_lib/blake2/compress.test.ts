import { toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { blake2Blocks } from './blocks.ts';
import { compressDetailed, counterWords, gDetail } from './compress.ts';
import { blake2sCompress, BLAKE2S_ENGINE } from './reference.ts';
import { BLAKE2B, BLAKE2S, wordsFromLittleEndian, wordsToLittleEndian } from './variants.ts';

const hex32 = (words: readonly number[]) => words.map((word) => BLAKE2S.arith.toHex(word));
const H0_S256 = [...BLAKE2S.iv.slice(0, 1).map((word) => (word ^ 0x01010020) >>> 0), ...BLAKE2S.iv.slice(1)];
const ABC_BLOCK = blake2Blocks(Array.from(utf8Bytes('abc')), [], 64)[0]!;

describe('compressDetailed', () => {
  const detail = compressDetailed(BLAKE2S, H0_S256, wordsFromLittleEndian(BLAKE2S.arith, ABC_BLOCK.bytes), ABC_BLOCK.t, true);

  it('loads v as RFC 7693 Appendix B prints it at i = 0 (t0 = 3, final flag set)', () => {
    expect(hex32(detail.vLoaded)).toEqual(['6b08e647', 'bb67ae85', '3c6ef372', 'a54ff53a', '510e527f', '9b05688c', '1f83d9ab', '5be0cd19', '6a09e667', 'bb67ae85', '3c6ef372', 'a54ff53a', '510e527c', '9b05688c', 'e07c2654', '5be0cd19']);
    expect([detail.t0, detail.t1, detail.f0]).toEqual([3, 0, 0xffffffff]);
  });

  it('after round 1 v equals Appendix B (i = 1); each round runs eight G calls chained through v', () => {
    const [round0] = detail.rounds;
    expect(hex32(round0!.after).slice(0, 4)).toEqual(['16a3242e', 'd7b5e238', 'ce8ce24b', '927aede1']);
    expect(detail.rounds).toHaveLength(10);
    expect(round0!.gs.map((g) => g.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    round0!.gs.slice(1).forEach((g, k) => expect(g.before).toEqual(round0!.gs[k]!.after));
    expect(round0!.gs.at(-1)!.after).toEqual(round0!.after);
  });

  it('equals the untraced reference compression', () => {
    const h = blake2sCompress(Uint32Array.from(H0_S256), Uint8Array.from(ABC_BLOCK.bytes), 3, true);
    expect(detail.hOut).toEqual([...h]);
    expect(toHex(BLAKE2S_ENGINE.bytes(h))).toBe('508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982');
  });

  it('G writes a″, b″, c″, d″ into its four positions and uses σ[r mod 10]', () => {
    const v = detail.vLoaded;
    const g = gDetail(BLAKE2S, v, detail.m, 10, 5);
    expect(g.positions).toEqual([1, 6, 11, 12]);
    expect([g.xIndex, g.yIndex]).toEqual([10, 11]);
    expect([g.after[1], g.after[6], g.after[11], g.after[12]]).toEqual([g.a2, g.b2, g.c2, g.d2]);
    expect(g.after.filter((_, index) => ![1, 6, 11, 12].includes(index))).toEqual(v.filter((_, index) => ![1, 6, 11, 12].includes(index)));
    expect(g.a1).toBe(BLAKE2S.arith.add(v[1]!, v[6]!, g.x));
    expect(g.d1).toBe(BLAKE2S.arith.rotr(BLAKE2S.arith.xor(v[12]!, g.a1), 16));
  });

  it('BLAKE2b runs 12 rounds on bigint words', () => {
    const block = compressDetailed(BLAKE2B, BLAKE2B.iv, new Array<bigint>(16).fill(0n), 0, false);
    expect(block.rounds).toHaveLength(12);
    expect(block.f0).toBe(0n);
    expect(typeof block.hOut[0]).toBe('bigint');
  });
});

describe('counterWords', () => {
  it('splits t into t0 = t mod 2^w and t1 = ⌊t / 2^w⌋', () => {
    expect(counterWords(BLAKE2S, 2 ** 32 + 5)).toEqual([5, 1]);
    expect(counterWords(BLAKE2B, 2 ** 40)).toEqual([2n ** 40n, 0n]);
  });
});

describe('variants', () => {
  it('read and write words little-endian (RFC 7693 §2.4)', () => {
    expect(wordsFromLittleEndian(BLAKE2S.arith, [0x61, 0x62, 0x63, 0x00])).toEqual([0x00636261]);
    expect(wordsToLittleEndian(BLAKE2S.arith, [0x00636261])).toEqual([0x61, 0x62, 0x63, 0x00]);
    expect(wordsToLittleEndian(BLAKE2B.arith, [0x0102030405060708n])).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(wordsFromLittleEndian(BLAKE2B.arith, [8, 7, 6, 5, 4, 3, 2, 1])).toEqual([0x0102030405060708n]);
  });
});
