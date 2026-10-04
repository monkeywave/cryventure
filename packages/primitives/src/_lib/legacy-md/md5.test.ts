import { toHex, utf8Bytes } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { MD5_FUNCTIONS, MD5_IV, MD5_T, md5Compress, md5Digest, md5Operation, md5Padding, md5PadTail, md5StateBytes } from './md5.ts';

/** RFC 1321 A.5 test suite. */
const SUITE: readonly [string, string][] = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
];

describe('MD5 constants', () => {
  it('T[i] = ⌊2^32 · |sin(i)|⌋ for i = 1 … 64 (RFC 1321 §3.4)', () => {
    const computed = Array.from({ length: 64 }, (_, index) => Math.floor(2 ** 32 * Math.abs(Math.sin(index + 1))));
    expect(MD5_T).toEqual(computed);
  });

  it('keeps T[22] and T[44], which the RFC prints without a leading zero', () => {
    expect([MD5_T[21], MD5_T[43]]).toEqual([0x02441453, 0x04881d05]);
  });

  it('starts from A … D = 01 23 45 67, 89 ab cd ef, fe dc ba 98, 76 54 32 10 read little-endian', () => {
    expect(toHex(md5StateBytes(Uint32Array.from(MD5_IV)))).toBe('0123456789abcdeffedcba9876543210');
  });
});

describe('md5Operation', () => {
  it.each([
    [0, { round: 0, fn: 'F', k: 0, s: 7 }],
    [15, { round: 0, fn: 'F', k: 15, s: 22 }],
    [16, { round: 1, fn: 'G', k: 1, s: 5 }],
    [17, { round: 1, fn: 'G', k: 6, s: 9 }],
    [32, { round: 2, fn: 'H', k: 5, s: 4 }],
    [33, { round: 2, fn: 'H', k: 8, s: 11 }],
    [48, { round: 3, fn: 'I', k: 0, s: 6 }],
    [63, { round: 3, fn: 'I', k: 9, s: 21 }],
  ] as const)('operation %i is %j', (i, expected) => {
    expect(md5Operation(i)).toEqual(expected);
  });

  it('visits every word once per round', () => {
    for (let round = 0; round < 4; round++) {
      const ks = Array.from({ length: 16 }, (_, j) => md5Operation(16 * round + j).k);
      expect(new Set(ks).size).toBe(16);
    }
  });

  it('rejects indices outside 0 … 63', () => {
    expect(() => md5Operation(64)).toThrow(RangeError);
    expect(() => md5Operation(-1)).toThrow(RangeError);
  });
});

describe('MD5 auxiliary functions', () => {
  it('compute F, G, H, I bitwise', () => {
    const [x, y, z] = [0xff00ff00, 0xf0f0f0f0, 0xcccccccc];
    expect(MD5_FUNCTIONS.F(x, y, z)).toBe(0xf0ccf0cc);
    expect(MD5_FUNCTIONS.G(x, y, z)).toBe(0xfc30fc30);
    expect(MD5_FUNCTIONS.H(x, y, z)).toBe(0xc33cc33c);
    expect(MD5_FUNCTIONS.I(x, y, z)).toBe(0x0fc30fc3);
  });
});

describe('md5Padding', () => {
  it('appends 80, zeros and the bit length little-endian', () => {
    const { padded, zeroBytes, messageBits } = md5Padding(utf8Bytes('abc'));
    expect(padded.length).toBe(64);
    expect(zeroBytes).toBe(52);
    expect(messageBits).toBe(24);
    expect(toHex(padded.subarray(0, 4))).toBe('61626380');
    expect(toHex(padded.subarray(56))).toBe('1800000000000000');
  });

  it('needs a second block from 56 bytes on', () => {
    expect(md5Padding(new Uint8Array(55)).padded.length).toBe(64);
    expect(md5Padding(new Uint8Array(56)).padded.length).toBe(128);
    expect(toHex(md5Padding(new Uint8Array(80)).padded.subarray(120))).toBe('8002000000000000');
  });

  it('pads a tail with the length of the whole message', () => {
    const tail = md5PadTail(utf8Bytes('ab'), 66);
    expect(tail.length).toBe(64);
    expect(toHex(tail.subarray(56))).toBe('1002000000000000');
  });
});

describe('md5Compress and md5Digest', () => {
  it.each(SUITE)('RFC 1321 A.5: MD5(%j)', (text, digest) => {
    expect(toHex(md5Digest(utf8Bytes(text)))).toBe(digest);
  });

  it('updates the state in place', () => {
    const h = Uint32Array.from(MD5_IV);
    expect(md5Compress(h, md5Padding(new Uint8Array(0)).padded)).toBe(h);
    expect(toHex(md5StateBytes(h))).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });
});
