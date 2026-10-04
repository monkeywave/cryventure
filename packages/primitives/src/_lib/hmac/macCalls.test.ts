import { utf8Bytes, toHex } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { keyedMac, macDisplayName } from './macCalls.ts';
import { HMAC_SHA1, HMAC_SHA256 } from '../prf/testMacs.ts';

describe('macDisplayName', () => {
  it('upper-cases the member id', () => {
    expect([macDisplayName(HMAC_SHA256), macDisplayName({ id: 'hmac-sha-512/256' }), macDisplayName({ id: 'hmac-md5' })]).toEqual(['HMAC-SHA-256', 'HMAC-SHA-512/256', 'HMAC-MD5']);
  });
});

describe('keyedMac', () => {
  const key = utf8Bytes('Jefe');
  const data = utf8Bytes('what do ya want for nothing?');

  it('equals the one-shot MAC (RFC 4231 test case 2)', () => {
    expect(toHex(keyedMac(HMAC_SHA256.create(key), data))).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    expect(toHex(keyedMac(HMAC_SHA1.create(key), data))).toBe(toHex(HMAC_SHA1.mac(key, data)));
  });

  it('leaves the keyed context untouched, so it can be reused', () => {
    const keyed = HMAC_SHA256.create(key);
    const first = toHex(keyedMac(keyed, data));
    keyedMac(keyed, utf8Bytes('other'));
    expect(toHex(keyedMac(keyed, data))).toBe(first);
  });
});
