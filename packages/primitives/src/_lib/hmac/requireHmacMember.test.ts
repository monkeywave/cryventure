import type { MacFamily, MacFunction, PortResolver } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { HMAC_SHA256 } from '../prf/testMacs.ts';
import { requireHmacMember } from './requireHmacMember.ts';

const NS = 'plugin.test-prf';
const KEYED: MacFunction = { ...HMAC_SHA256, id: 'blake2s-256', construction: { kind: 'keyed-hash' } };
const FAMILIES: Record<string, MacFamily> = {
  sha256: { id: 'sha256', functions: [HMAC_SHA256] },
  blake2: { id: 'blake2', functions: [KEYED] },
};
const resolve = ((port: string, id: string) => (port === 'Mac' ? FAMILIES[id] : undefined)) as PortResolver;

describe('requireHmacMember', () => {
  it('returns the HMAC member a ref names', () => {
    expect(requireHmacMember(resolve, 'sha256:hmac-sha-256', NS)).toEqual({ ok: true, mac: HMAC_SHA256 });
  });

  it('refuses a member that is not an HMAC', () => {
    expect(requireHmacMember(resolve, 'blake2:blake2s-256', NS)).toEqual({ ok: false, error: { key: `${NS}.error.notHmac`, params: { id: 'blake2:blake2s-256' } } });
  });

  it('passes the core run errors through', () => {
    expect(requireHmacMember(resolve, 'sha256:hmac-sha-1', NS)).toEqual({ ok: false, error: { key: 'core.error.portMemberMissing', params: { id: 'sha256:hmac-sha-1' } } });
    expect(requireHmacMember(resolve, 'md5:hmac-md5', NS)).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'md5' } } });
    expect(requireHmacMember(undefined, 'sha256:hmac-sha-256', NS)).toMatchObject({ ok: false, error: { key: 'core.error.portMissing' } });
  });
});
