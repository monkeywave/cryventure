import { toHex, type PrimitiveManifest, type ProducerLookup } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { hmacFunction } from '../_lib/hmac/hmac.ts';
import { bytes, testHash } from '../_lib/hmac/testHashes.ts';
import { hashZoom } from './hashZoom.ts';
import { computeHmac, hashName, resolveTagLength, tagLengthBounds } from './hmacCompute.ts';

describe('hashName', () => {
  it.each([
    ['sha-256', 'SHA-256'],
    ['sha-512/256', 'SHA-512/256'],
    ['sha3-256', 'SHA3-256'],
    ['md5', 'MD5'],
    ['blake2s-256', 'BLAKE2s-256'],
    ['blake2b-512', 'BLAKE2b-512'],
    ['keccak-256', 'Keccak-256'],
  ])('%s → %s', (id, name) => expect(hashName(id)).toBe(name));
});

describe('tag length rule (RFC 2104 §5): max(10, ⌈L/2⌉) ≤ t ≤ L', () => {
  it.each([
    [16, { min: 10, max: 16 }],
    [20, { min: 10, max: 20 }],
    [32, { min: 16, max: 32 }],
    [64, { min: 32, max: 64 }],
  ])('L = %i', (outputSize, bounds) => expect(tagLengthBounds(outputSize)).toEqual(bounds));

  it('resolves full to L and checks explicit lengths', () => {
    const sha256 = { id: 'sha-256', outputSize: 32 };
    expect(resolveTagLength('full', sha256)).toEqual({ ok: true, bytes: 32 });
    expect(resolveTagLength('16', sha256)).toEqual({ ok: true, bytes: 16 });
    expect(resolveTagLength('12', sha256)).toEqual({ ok: false, error: { key: 'plugin.hmac.error.tagLength', params: { length: 12, min: 16, max: 32, hash: 'SHA-256' } } });
  });
});

describe('computeHmac', () => {
  const sha256 = testHash('sha256');
  const message = bytes('4869205468657265');

  it('equals the Mac lib and exposes every intermediate (RFC 4231 test case 1)', () => {
    const key = bytes('0b'.repeat(20));
    const computation = computeHmac(sha256, key, message, 32);
    expect(toHex(computation.tag)).toBe(toHex(hmacFunction(sha256, 'sha256:sha-256', 'hmac-sha-256').mac(key, message)));
    expect(computation.branch).toBe('padded');
    expect(computation.inner.paddedKey).toEqual(computation.k0.map((byte) => byte ^ 0x36));
    expect(computation.outer.paddedKey).toEqual(computation.k0.map((byte) => byte ^ 0x5c));
    expect(computation.inner.midstate).toHaveLength(32);
    expect(computation.comparison).toBeUndefined();
  });

  it('records H(K) for a key longer than B', () => {
    const key = bytes('aa'.repeat(131));
    const computation = computeHmac(sha256, key, message, 32);
    expect(computation.branch).toBe('hashed');
    expect(computation.keyDigest).toEqual(Array.from(sha256.hash(key)));
    expect(computation.k0.slice(0, 32)).toEqual(computation.keyDigest);
  });

  it('compares with the expected tag without an early exit', () => {
    const key = bytes('0b'.repeat(20));
    const tag = computeHmac(sha256, key, message, 32).tag;
    const wrongFirst = Uint8Array.from(tag.map((byte, index) => (index === 0 ? byte ^ 1 : byte)));
    const comparison = computeHmac(sha256, key, message, 32, wrongFirst).comparison!;
    expect(comparison.equal).toBe(false);
    expect(comparison.steps).toHaveLength(32);
  });
});

describe('hashZoom', () => {
  const lab = { id: 'toy-hash', hashLabParams: (functionId: string, messageHex: string) => (messageHex.length <= 4 ? { functionId, messageHex } : undefined) } as unknown as PrimitiveManifest;
  const lookup: ProducerLookup = new Map([[lab.id, lab]]);

  it('builds the zoom from the producer’s hashLabParams', () => {
    expect(hashZoom(lookup, 'toy-hash', 'f', [0xab, 0xcd])).toEqual({ producerId: 'toy-hash', params: { functionId: 'f', messageHex: 'abcd' } });
  });

  it('gives no zoom for an unknown producer, a producer without the hook or an input the lab rejects', () => {
    expect(hashZoom(lookup, 'other', 'f', [])).toBeUndefined();
    expect(hashZoom(new Map([['bare', { id: 'bare' } as PrimitiveManifest]]), 'bare', 'f', [])).toBeUndefined();
    expect(hashZoom(lookup, 'toy-hash', 'f', [1, 2, 3])).toBeUndefined();
  });
});
