import { describe, expect, it } from 'vitest';
import { SHA256_IV, SHA512_IV } from './constants.ts';
import { sha2Pad } from './padding.ts';
import { sha256Compress, sha512Compress } from './reference.ts';
import { WORD32, WORD64, wordsHex } from './words.ts';

const ABC = [0x61, 0x62, 0x63];

describe('sha256Compress', () => {
  it('turns H(0) and the padded "abc" block into the FIPS 180-4 SHA-256 digest words', () => {
    const h = Uint32Array.from(SHA256_IV);
    expect(wordsHex(WORD32, Array.from(sha256Compress(h, sha2Pad(ABC, 64))), '')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('updates h in place and returns it', () => {
    const h = Uint32Array.from(SHA256_IV);
    expect(sha256Compress(h, sha2Pad(ABC, 64))).toBe(h);
    expect(h[0]).toBe(0xba7816bf);
  });

  it('reads a block at a non-zero offset of a larger buffer', () => {
    const buffer = new Uint8Array(3 + 64);
    buffer.set(sha2Pad(ABC, 64), 3);
    const h = sha256Compress(Uint32Array.from(SHA256_IV), buffer.subarray(3));
    expect(h[7]).toBe(0xf20015ad);
  });
});

describe('sha512Compress', () => {
  it('turns H(0) and the padded "abc" block into the FIPS 180-4 SHA-512 digest words', () => {
    const h = BigUint64Array.from(SHA512_IV);
    expect(wordsHex(WORD64, Array.from(sha512Compress(h, sha2Pad(ABC, 128))), '')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });

  it('updates h in place and reads a block at a non-zero offset', () => {
    const buffer = new Uint8Array(5 + 128);
    buffer.set(sha2Pad(ABC, 128), 5);
    const h = BigUint64Array.from(SHA512_IV);
    expect(sha512Compress(h, buffer.subarray(5))).toBe(h);
    expect(h[7]).toBe(0x2a9ac94fa54ca49fn);
  });
});
