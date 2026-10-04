import { describe, expect, it } from 'vitest';
import { SHA256_PARAMS, SHA512_PARAMS } from './algorithms.ts';
import { SHA256_IV, SHA512_IV } from './constants.ts';
import { compressDetailed, type RoundDetail, type ScheduleDetail } from './compress.ts';
import { sha256Compress, sha512Compress } from './reference.ts';
import { sha2Padding } from './padding.ts';
import { WORD32, WORD64, wordsFromBytes, wordsHex, wordsToBytes } from './words.ts';

describe('word arithmetic', () => {
  it('rotates, shifts and adds 32-bit words modulo 2^32', () => {
    expect(WORD32.rotr(0x00000001, 1)).toBe(0x80000000);
    expect(WORD32.shr(0x80000000, 31)).toBe(1);
    expect(WORD32.add(0xffffffff, 2, 0xffffffff)).toBe(0);
    expect(WORD32.not(0)).toBe(0xffffffff);
  });

  it('rotates, shifts and adds 64-bit words modulo 2^64', () => {
    expect(WORD64.rotr(1n, 1)).toBe(0x8000000000000000n);
    expect(WORD64.add(0xffffffffffffffffn, 2n)).toBe(1n);
    expect(WORD64.not(0n)).toBe(0xffffffffffffffffn);
  });

  it('maps words to big-endian bytes and hex and back', () => {
    const bytes = [0x61, 0x62, 0x63, 0x80, 0, 0, 0, 0x18];
    expect(wordsHex(WORD32, wordsFromBytes(WORD32, bytes))).toBe('61626380 00000018');
    expect(wordsHex(WORD64, wordsFromBytes(WORD64, bytes))).toBe('6162638000000018');
    expect(wordsToBytes(WORD64, wordsFromBytes(WORD64, bytes))).toEqual(bytes);
    expect(wordsToBytes(WORD32, wordsFromBytes(WORD32, bytes))).toEqual(bytes);
  });
});

describe('sha2Padding (FIPS 180-4 §5.1)', () => {
  it('pads "abc" to one 64-byte block with a 64-bit length (§5.1.1)', () => {
    const { padded, zeroBytes, lengthBytes, messageBits } = sha2Padding([0x61, 0x62, 0x63], 64);
    expect([padded.length, zeroBytes, lengthBytes, messageBits]).toEqual([64, 52, 8, 24]);
    expect(padded[3]).toBe(0x80);
    expect(padded[63]).toBe(0x18);
  });

  it('pads "abc" to one 128-byte block with a 128-bit length (§5.1.2)', () => {
    const { padded, zeroBytes, lengthBytes } = sha2Padding([0x61, 0x62, 0x63], 128);
    expect([padded.length, zeroBytes, lengthBytes, padded[127]]).toEqual([128, 108, 16, 0x18]);
  });

  it('needs a second block when the length no longer fits (56 bytes into 64-byte blocks)', () => {
    expect(sha2Padding(new Uint8Array(56), 64).padded.length).toBe(128);
    expect(sha2Padding(new Uint8Array(55), 64).padded.length).toBe(64);
    expect(sha2Padding(new Uint8Array(0), 64).padded.length).toBe(64);
  });
});

/** Deterministic, varied test blocks (no fast-check in _lib: it may import core and vitest only). */
const blocks = (bytes: number) => Array.from({ length: 12 }, (_, seed) => Uint8Array.from({ length: bytes }, (_, index) => (index * (2 * seed + 1) * 37 + seed * 101 + (index >> 3) * seed) & 0xff));

describe('compressDetailed agrees with the independent reference compression', () => {
  it('for 32-bit words (SHA-256)', () => {
    for (const data of blocks(64)) {
      const detail = compressDetailed(SHA256_PARAMS, SHA256_IV, data);
      expect(detail.hOut).toEqual(Array.from(sha256Compress(Uint32Array.from(SHA256_IV), data)));
    }
  });

  it('for 64-bit words (SHA-512)', () => {
    for (const data of blocks(128)) {
      const detail = compressDetailed(SHA512_PARAMS, SHA512_IV, data);
      expect(detail.hOut).toEqual(Array.from(sha512Compress(BigUint64Array.from(SHA512_IV), data)));
    }
  });

  it('records schedule t (t ≥ 16) right before round t, with consistent partial sums', () => {
    const detail = compressDetailed(SHA256_PARAMS, SHA256_IV, sha2Padding([0x61, 0x62, 0x63], 64).padded);
    expect(detail.events.map((event) => `${event.kind[0]}${event.t}`).slice(15, 20)).toEqual(['r15', 's16', 'r16', 's17', 'r17']);
    const schedule = detail.events.find((event): event is ScheduleDetail<number> => event.kind === 'schedule' && event.t === 20)!;
    expect(schedule.p1).toBe(WORD32.add(schedule.w16, schedule.sigma0));
    expect(schedule.p2).toBe(WORD32.add(schedule.p1, schedule.w7));
    expect(schedule.w).toBe(detail.schedule[20]);
    const round = detail.events.find((event): event is RoundDetail<number> => event.kind === 'round' && event.t === 5)!;
    expect(round.kw).toBe(WORD32.add(round.k, round.w));
    expect(round.after[0]).toBe(WORD32.add(round.T1, round.T2));
    expect(round.after[4]).toBe(WORD32.add(round.before[3]!, round.T1));
  });
});
