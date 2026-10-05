import type { MacFunction } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { HMAC_MD5, HMAC_SHA1, HMAC_SHA224, HMAC_SHA256, HMAC_SHA384, testHmac } from '../prf/testMacs.ts';
import { hashPaddingReserve, hmacCallCompressions } from './compressions.ts';

describe('hashPaddingReserve', () => {
  it('MD5/SHA-1/SHA-256: 0x80 + 8 bytes; SHA-512: 0x80 + 16 bytes; SHA3: 1 byte', () => {
    expect(hashPaddingReserve(HMAC_MD5)).toBe(9);
    expect(hashPaddingReserve(HMAC_SHA1)).toBe(9);
    expect(hashPaddingReserve(HMAC_SHA224)).toBe(9);
    expect(hashPaddingReserve(HMAC_SHA384)).toBe(17);
    expect(hashPaddingReserve(testHmac('sha3-224', 'sha3', 'hmac-sha3-224'))).toBe(1);
  });

  it('rejects a MAC that is not an HMAC', () => {
    const kmac = { id: 'kmac128', blockSize: 168, outputSize: 32, construction: { kind: 'kmac' } } as MacFunction;
    expect(() => hashPaddingReserve(kmac)).toThrow(RangeError);
  });
});

describe('hmacCallCompressions', () => {
  it('counts the inner blocks of message + padding and the outer blocks of digest + padding', () => {
    const sha256 = HMAC_SHA256;
    expect(hmacCallCompressions(sha256, 0)).toBe(2);
    expect(hmacCallCompressions(sha256, 55)).toBe(2);
    expect(hmacCallCompressions(sha256, 56)).toBe(3);
    expect(hmacCallCompressions(sha256, 132)).toBe(4);
  });
});
