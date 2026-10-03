import { describe, expect, it } from 'vitest';
import { bindAesKey, encodeInt, encodeWord, requireField, storedRounds } from './bindAesKey.ts';
import { aesKeyLayoutFor, IMPLS, type ImplSpec } from './data.ts';

/** FIPS 197 App. A.1: key 2b7e1516 28aed2a6 abf71588 09cf4f3c; w40..w43 = d014f9a8 c9ee2589 e13f0cc8 b6630ca6. */
const A1_KEY = [0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c];
const A1_ROUND_KEY_10 = [0xd0, 0x14, 0xf9, 0xa8, 0xc9, 0xee, 0x25, 0x89, 0xe1, 0x3f, 0x0c, 0xc8, 0xb6, 0x63, 0x0c, 0xa6];
const FILLER = Array.from<number>({ length: 16 }).fill(0xee);
const A1_ROUND_KEYS = [A1_KEY, ...Array.from({ length: 9 }, () => FILLER), A1_ROUND_KEY_10];

const impl = (id: string): ImplSpec => IMPLS.find((candidate) => candidate.id === id)!;
const layout = aesKeyLayoutFor('x86_64-linux-gnu');
const hex = (bytes: Iterable<number>) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');

describe('bindAesKey (hand-verified, FIPS 197 A.1)', () => {
  it('c-ref stores each rd_key word as a host-endian u32 (byte-reversed on little-endian)', () => {
    const bytes = bindAesKey(layout, impl('c-ref'), A1_ROUND_KEYS, 10);
    expect(bytes).toHaveLength(244);
    expect(hex(bytes.subarray(0, 16))).toBe('16 15 7e 2b a6 d2 ae 28 88 15 f7 ab 3c 4f cf 09');
    expect(hex(bytes.subarray(160, 176))).toBe('a8 f9 14 d0 89 25 ee c9 c8 0c 3f e1 a6 0c 63 b6');
    expect(hex(bytes.subarray(240, 244))).toBe('0a 00 00 00');
  });

  it('aesni stores raw bytes and rounds − 1', () => {
    const bytes = bindAesKey(layout, impl('aesni'), A1_ROUND_KEYS, 10);
    expect(hex(bytes.subarray(0, 16))).toBe('2b 7e 15 16 28 ae d2 a6 ab f7 15 88 09 cf 4f 3c');
    expect(hex(bytes.subarray(160, 176))).toBe('d0 14 f9 a8 c9 ee 25 89 e1 3f 0c c8 b6 63 0c a6');
    expect(hex(bytes.subarray(240, 244))).toBe('09 00 00 00');
  });

  it('armv8 stores raw bytes and the full round count', () => {
    const bytes = bindAesKey(aesKeyLayoutFor('aarch64-linux-gnu'), impl('armv8'), A1_ROUND_KEYS, 10);
    expect(hex(bytes.subarray(0, 16))).toBe('2b 7e 15 16 28 ae d2 a6 ab f7 15 88 09 cf 4f 3c');
    expect(hex(bytes.subarray(240, 244))).toBe('0a 00 00 00');
  });

  it('leaves the unused rd_key words zero', () => {
    const bytes = bindAesKey(layout, impl('c-ref'), A1_ROUND_KEYS, 10);
    expect(bytes.subarray(176, 240).every((byte) => byte === 0)).toBe(true);
  });

  it('fills all 240 rd_key bytes for AES-256', () => {
    const keys = Array.from({ length: 15 }, () => FILLER);
    const bytes = bindAesKey(layout, impl('aesni'), keys, 14);
    expect(bytes.subarray(0, 240).every((byte) => byte === 0xee)).toBe(true);
    expect(hex(bytes.subarray(240, 244))).toBe('0d 00 00 00');
  });

  it('rejects a round-key count that does not match the rounds', () => {
    expect(() => bindAesKey(layout, impl('c-ref'), A1_ROUND_KEYS.slice(1), 10)).toThrow(/10 round keys for 10 rounds/);
  });

  it('rejects a round key that is not 16 bytes', () => {
    const keys = [A1_KEY.slice(0, 15), ...A1_ROUND_KEYS.slice(1)];
    expect(() => bindAesKey(layout, impl('c-ref'), keys, 10)).toThrow(/round key of 15 bytes/);
  });

  it('rejects a schedule larger than rd_key', () => {
    const small = { ...layout, fields: [{ ...layout.fields[0]!, size: 160 }, layout.fields[1]!] };
    expect(() => bindAesKey(small, impl('c-ref'), A1_ROUND_KEYS, 10)).toThrow(/exceed rd_key/);
  });
});

describe('storedRounds', () => {
  it('follows impls.json per key size', () => {
    expect([10, 12, 14].map((rounds) => storedRounds(impl('c-ref'), rounds))).toEqual([10, 12, 14]);
    expect([10, 12, 14].map((rounds) => storedRounds(impl('aesni'), rounds))).toEqual([9, 11, 13]);
    expect([10, 12, 14].map((rounds) => storedRounds(impl('armv8'), rounds))).toEqual([10, 12, 14]);
  });

  it('throws for a round count AES does not have', () => {
    expect(() => storedRounds(impl('c-ref'), 11)).toThrow(/no rounds value for 11/);
  });
});

describe('encodeWord', () => {
  it('reverses host-endian words on little-endian hosts only', () => {
    expect(encodeWord([1, 2, 3, 4], 'host-endian-u32', 'little')).toEqual([4, 3, 2, 1]);
    expect(encodeWord([1, 2, 3, 4], 'host-endian-u32', 'big')).toEqual([1, 2, 3, 4]);
    expect(encodeWord([1, 2, 3, 4], 'raw-bytes', 'little')).toEqual([1, 2, 3, 4]);
  });
});

describe('encodeInt', () => {
  it('encodes in either byte order, negatives as two’s complement', () => {
    expect(encodeInt(10, 4, 'little')).toEqual([10, 0, 0, 0]);
    expect(encodeInt(0x01020304, 4, 'big')).toEqual([1, 2, 3, 4]);
    expect(encodeInt(-1, 4, 'little')).toEqual([255, 255, 255, 255]);
  });
});

describe('requireField', () => {
  it('finds a field by name and throws for a missing one', () => {
    expect(requireField(layout, 'rounds').offset).toBe(240);
    expect(() => requireField(layout, 'nope')).toThrow(/no field "nope"/);
  });
});
