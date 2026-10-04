import { describe, expect, it } from 'vitest';
import { readDigits } from '../_lib/params/manifestKit.ts';
import { PBKDF2_DEFAULT_MAC, PBKDF2_ITERATIONS, PBKDF2_PARAM_FIELDS, PBKDF2_PRESETS, pbkdf2Manifest, validatePbkdf2Params, type Pbkdf2Params } from './manifest.ts';

const NS = 'plugin.pbkdf2';
const TC1 = PBKDF2_PRESETS[0]!.params;
const error = (key: string, params?: Record<string, unknown>) => ({ ok: false, error: { key: `${NS}.error.${key}`, ...(params === undefined ? {} : { params }) } });

describe('readDigits', () => {
  it.each([
    ['1', '1'],
    ['100000', '100000'],
    ['007', '7'],
  ])('accepts %j as %j', (input, expected) => {
    expect(readDigits(input, PBKDF2_ITERATIONS)).toBe(expected);
  });

  it.each([['0'], ['100001'], [''], ['-1'], ['+1'], [' 1'], ['1.0'], ['1e3'], [1], [null]])('rejects %j', (input) => {
    expect(readDigits(input, PBKDF2_ITERATIONS)).toBeUndefined();
  });
});

describe('validatePbkdf2Params', () => {
  it('accepts every preset unchanged', () => {
    for (const preset of PBKDF2_PRESETS) expect(validatePbkdf2Params(preset.params)).toEqual({ ok: true, value: preset.params });
  });

  it('normalises hex and digits', () => {
    const params: Pbkdf2Params = { ...TC1, passwordEncoding: 'hex', password: '70:61 73', saltEncoding: 'hex', salt: 'AB', iterations: '0042', length: '020' };
    expect(validatePbkdf2Params(params)).toEqual({ ok: true, value: { ...params, password: '706173', salt: 'ab', iterations: '42', length: '20' } });
  });

  it('falls back to HMAC-SHA-256 when no PRF is named', () => {
    const { mac: _mac, ...rest } = TC1;
    expect(validatePbkdf2Params(rest)).toEqual({ ok: true, value: { ...TC1, mac: PBKDF2_DEFAULT_MAC } });
  });

  it('accepts an empty password and an empty salt (RFC 8018 allows any octet string)', () => {
    expect(validatePbkdf2Params({ ...TC1, password: '', salt: '' }).ok).toBe(true);
  });

  it('accepts the limits: 128-byte password and salt, c = 100000, dkLen = 128', () => {
    expect(validatePbkdf2Params({ ...TC1, password: 'p'.repeat(128), salt: 's'.repeat(128), iterations: '100000', length: '128' }).ok).toBe(true);
    expect(validatePbkdf2Params({ ...TC1, passwordEncoding: 'hex', password: 'ff'.repeat(128) }).ok).toBe(true);
  });

  it.each<[string, unknown, unknown]>([
    ['not an object', null, error('invalidParams')],
    ['a bad member ref', { ...TC1, mac: 'sha1' }, error('mac')],
    ['an unknown encoding', { ...TC1, saltEncoding: 'base64' }, error('encoding')],
    ['a 129-byte password', { ...TC1, password: 'p'.repeat(129) }, error('passwordLength', { length: 129, max: 128 })],
    ['a 129-byte hex salt', { ...TC1, saltEncoding: 'hex', salt: '00'.repeat(129) }, error('saltLength', { length: 129, max: 128 })],
    ['a password that is not text', { ...TC1, password: 5 }, error('invalidParams')],
    ['iterations 0', { ...TC1, iterations: '0' }, error('iterations', { min: 1, max: 100000 })],
    ['iterations 100001', { ...TC1, iterations: '100001' }, error('iterations', { min: 1, max: 100000 })],
    ['length 0', { ...TC1, length: '0' }, error('length', { min: 1, max: 128 })],
    ['length 129', { ...TC1, length: '129' }, error('length', { min: 1, max: 128 })],
  ])('rejects %s', (_name, params, expected) => {
    expect(validatePbkdf2Params(params)).toEqual(expected);
  });

  it('keeps hex syntax errors from core', () => {
    expect(validatePbkdf2Params({ ...TC1, passwordEncoding: 'hex', password: 'zz' })).toEqual({ ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } } });
  });
});

describe('PBKDF2_PARAM_FIELDS', () => {
  it('offers HMAC members only and measures password and salt by their own encodings', () => {
    const byName = Object.fromEntries(PBKDF2_PARAM_FIELDS.map((field) => [field.name, field]));
    expect(byName['mac']).toMatchObject({ kind: 'port', port: 'Mac', member: true, constructions: ['hmac'] });
    expect(byName['password']).toMatchObject({ kind: 'text', maxLength: 128, encodingParam: 'passwordEncoding' });
    expect(byName['salt']).toMatchObject({ kind: 'text', maxLength: 128, encodingParam: 'saltEncoding' });
    expect(byName['iterations']).toMatchObject({ kind: 'text', maxLength: 6 });
    expect(byName['length']).toMatchObject({ kind: 'text', maxLength: 3 });
    expect(PBKDF2_PARAM_FIELDS.map((field) => field.name)).toEqual(Object.keys(pbkdf2Manifest.defaults));
  });
});

describe('pbkdf2Manifest', () => {
  it('defaults to RFC 6070 test 1 and ships the six §2e presets', () => {
    expect(pbkdf2Manifest.defaults).toEqual(TC1);
    expect(PBKDF2_PRESETS.map((preset) => preset.id)).toEqual(['rfc6070-tc1', 'rfc6070-tc2', 'rfc6070-tc3', 'rfc6070-tc5', 'rfc7914-sha256-c1', 'rfc7914-sha256-c80000']);
  });
});
