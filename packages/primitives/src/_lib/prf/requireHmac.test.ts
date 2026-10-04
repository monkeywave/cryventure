import type { MacFamily, MacFunction, PortResolver } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { requireHmac } from './requireHmac.ts';
import { HMAC_SHA256 } from './testMacs.ts';

const NS = 'plugin.test-prf';
const KEYED: MacFunction = { ...HMAC_SHA256, id: 'blake2s-256', construction: { kind: 'keyed-hash' } };
const FAMILIES: Record<string, MacFamily> = {
  sha256: { id: 'sha256', functions: [HMAC_SHA256] },
  blake2: { id: 'blake2', functions: [KEYED] },
};
const resolve = ((port: string, id: string) => (port === 'Mac' ? FAMILIES[id] : undefined)) as PortResolver;

describe('requireHmac', () => {
  it('returns the HMAC member a ref names', () => {
    expect(requireHmac(resolve, 'sha256:hmac-sha-256', NS)).toEqual({ ok: true, mac: HMAC_SHA256 });
  });

  it('refuses a member that is not an HMAC', () => {
    expect(requireHmac(resolve, 'blake2:blake2s-256', NS)).toEqual({ ok: false, error: { key: `${NS}.error.notHmac`, params: { id: 'blake2:blake2s-256' } } });
  });

  it('passes the core run errors through', () => {
    expect(requireHmac(resolve, 'sha256:hmac-sha-1', NS)).toEqual({ ok: false, error: { key: 'core.error.portMemberMissing', params: { id: 'sha256:hmac-sha-1' } } });
    expect(requireHmac(resolve, 'md5:hmac-md5', NS)).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'md5' } } });
    expect(requireHmac(undefined, 'sha256:hmac-sha-256', NS)).toMatchObject({ ok: false, error: { key: 'core.error.portMissing' } });
  });
});
