import { macFunction, portMember } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { keccakHashFamily } from '../keccak/hash.ts';
import { MD5_FAMILY, SHA1_FAMILY } from '../legacy-md/hash.ts';
import { sha2HashFamily } from '../sha2/hash.ts';
import { hmacFamily } from './family.ts';
import { hmacFunction } from './hmac.ts';
import { bytes, hex, testHash } from './testHashes.ts';

describe('hmacFamily', () => {
  it('names members hmac-<functionId> in order, with the Hash member ref of the producer', () => {
    const family = hmacFamily(sha2HashFamily('sha512', ['sha-384', 'sha-512', 'sha-512/224', 'sha-512/256']), 'sha512', ['sha-384', 'sha-512', 'sha-512/224', 'sha-512/256']);
    expect(family.id).toBe('sha512');
    expect(family.functions.map((fn) => fn.id)).toEqual(['hmac-sha-384', 'hmac-sha-512', 'hmac-sha-512/224', 'hmac-sha-512/256']);
    expect(family.functions.map((fn) => fn.construction)).toEqual(['sha-384', 'sha-512', 'sha-512/224', 'sha-512/256'].map((id) => ({ kind: 'hmac', hash: `sha512:${id}` })));
  });

  it('builds each member over its hash function', () => {
    const family = hmacFamily(keccakHashFamily('sha3'), 'sha3', ['sha3-256']);
    const member = macFunction(family, 'hmac-sha3-256')!;
    const reference = hmacFunction(testHash('sha3-256'), 'sha3:sha3-256', 'hmac-sha3-256');
    expect(member.blockSize).toBe(136);
    expect(hex(member.mac(bytes('0102'), bytes('0304')))).toBe(hex(reference.mac(bytes('0102'), bytes('0304'))));
    expect(portMember('Mac', family, 'hmac-sha3-256')).toBe(member);
  });

  it('covers MD5 and SHA-1', () => {
    expect(hmacFamily(MD5_FAMILY, 'md5', ['md5']).functions.map((fn) => [fn.id, fn.construction])).toEqual([['hmac-md5', { kind: 'hmac', hash: 'md5:md5' }]]);
    expect(hmacFamily(SHA1_FAMILY, 'sha1', ['sha-1']).functions.map((fn) => fn.id)).toEqual(['hmac-sha-1']);
  });

  it('throws for a function the Hash family lacks', () => {
    expect(() => hmacFamily(MD5_FAMILY, 'md5', ['sha-1'])).toThrow(/sha-1/);
  });

  it('allows an empty member list', () => {
    expect(hmacFamily(MD5_FAMILY, 'md5', [])).toEqual({ id: 'md5', functions: [] });
  });
});
