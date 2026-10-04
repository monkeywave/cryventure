import { describe, expect, it } from 'vitest';
import { hashPortMembers, hmacMemberId, hmacPortMembers } from './manifestKit.ts';

describe('hmacMemberId', () => {
  it('prefixes the Hash member id with hmac-', () => {
    expect(['sha-256', 'sha-512/256', 'sha3-256', 'md5', 'sha-1'].map(hmacMemberId)).toEqual(['hmac-sha-256', 'hmac-sha-512/256', 'hmac-sha3-256', 'hmac-md5', 'hmac-sha-1']);
  });
});

describe('hmacPortMembers', () => {
  it('declares one hmac member per function id, labelled in the namespace, in order', () => {
    expect(hmacPortMembers('plugin.sha256', ['sha-224', 'sha-256'])).toEqual([
      { id: 'hmac-sha-224', labelKey: 'plugin.sha256.mac.hmac-sha-224', construction: 'hmac' },
      { id: 'hmac-sha-256', labelKey: 'plugin.sha256.mac.hmac-sha-256', construction: 'hmac' },
    ]);
  });

  it('is empty for no function ids', () => {
    expect(hmacPortMembers('plugin.md5', [])).toEqual([]);
  });
});

describe('hashPortMembers', () => {
  it('declares one Hash member per function id with the given label key and no construction', () => {
    expect(hashPortMembers(['sha-384', 'sha-512/256'], (id) => `plugin.sha512.param.algorithmOption.${id}`)).toEqual([
      { id: 'sha-384', labelKey: 'plugin.sha512.param.algorithmOption.sha-384' },
      { id: 'sha-512/256', labelKey: 'plugin.sha512.param.algorithmOption.sha-512/256' },
    ]);
  });
});
