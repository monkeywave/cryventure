import { describe, expect, it } from 'vitest';
import { hmacLabZoom } from '../_lib/hmac/labZoom.ts';
import { HMAC_MAX_KEY_BYTES, HMAC_MAX_MESSAGE_BYTES, HMAC_PARAM_FIELDS, HMAC_PRESETS, hmacManifest, validateHmacParams, type HmacParams } from './manifest.ts';

const NS = 'plugin.hmac';
const BASE = hmacManifest.defaults as HmacParams;

describe('validateHmacParams', () => {
  it('accepts every preset and the defaults', () => {
    for (const preset of HMAC_PRESETS) expect(validateHmacParams(preset.params), preset.id).toEqual({ ok: true, value: preset.params });
    expect(validateHmacParams(BASE).ok).toBe(true);
  });

  it('normalises hex key, message and expected tag', () => {
    const result = validateHmacParams({ ...BASE, key: '0B:0B', encoding: 'hex', input: 'AB CD', expected: 'FF' });
    expect(result).toEqual({ ok: true, value: { ...BASE, key: '0b0b', encoding: 'hex', input: 'abcd', expected: 'ff' } });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ ...BASE, hash: 'sha256' }, { key: `${NS}.error.hash` }],
    [{ ...BASE, hash: 'SHA:x' }, { key: `${NS}.error.hash` }],
    [{ ...BASE, encoding: 'latin1' }, { key: `${NS}.error.encoding`, params: { encoding: 'latin1' } }],
    [{ ...BASE, tagLength: '8' }, { key: `${NS}.error.tagLengthOption`, params: { tagLength: '8' } }],
    [{ ...BASE, key: '00'.repeat(257) }, { key: `${NS}.error.keyLength`, params: { length: 257 } }],
    [{ ...BASE, input: 'x'.repeat(257) }, { key: `${NS}.error.inputLength`, params: { length: 257 } }],
    [{ ...BASE, encoding: 'hex', input: '00'.repeat(257) }, { key: `${NS}.error.inputLength`, params: { length: 257 } }],
    [{ ...BASE, expected: '00'.repeat(65) }, { key: `${NS}.error.expectedLength`, params: { length: 65 } }],
  ])('rejects %j', (params, error) => {
    expect(validateHmacParams(params)).toEqual({ ok: false, error });
  });

  it('accepts the limits: a 256-byte key and message, a 64-byte expected tag, an empty key', () => {
    expect(validateHmacParams({ ...BASE, key: '00'.repeat(256), encoding: 'hex', input: '11'.repeat(256), expected: '22'.repeat(64) }).ok).toBe(true);
    expect(validateHmacParams({ ...BASE, key: '' }).ok).toBe(true);
  });
});

describe('hmac manifest', () => {
  it('declares a member Hash port field and the message as hex while encoding is hex', () => {
    expect(HMAC_PARAM_FIELDS.find((field) => field.name === 'hash')).toMatchObject({ kind: 'port', port: 'Hash', member: true });
    expect(HMAC_PARAM_FIELDS.find((field) => field.name === 'input')).toMatchObject({ kind: 'text', maxLength: 256, encodingParam: 'encoding' });
  });

  it('offers the presets of docs/M7.md §2b, rfc4231-tc1 first (the default)', () => {
    expect(HMAC_PRESETS.map((preset) => preset.id)).toEqual([
      'rfc4231-tc1',
      'rfc4231-tc2',
      'rfc4231-tc5-trunc',
      'rfc4231-tc6-longkey',
      'rfc2202-md5-tc1',
      'rfc2202-sha1-tc1',
      'hmac-sha512-tc1',
      'hmac-sha3-256-sample',
      'verify-pass',
      'verify-fail',
    ]);
    expect(hmacManifest.defaults).toEqual(HMAC_PRESETS[0]!.params);
  });

  it('verify-fail differs from verify-pass in the last byte only', () => {
    const [pass, fail] = ['verify-pass', 'verify-fail'].map((id) => HMAC_PRESETS.find((preset) => preset.id === id)!.params.expected);
    expect(fail!.slice(0, -2)).toBe(pass!.slice(0, -2));
    expect(fail!.slice(-2)).not.toBe(pass!.slice(-2));
  });
});

describe('zooms into this lab (_lib/hmac/labZoom.ts)', () => {
  it('validate accepts the shared builder\'s params unchanged, up to the key and message limits', () => {
    const zoom = hmacLabZoom('sha512:sha-512', new Array<number>(HMAC_MAX_KEY_BYTES).fill(7), new Array<number>(HMAC_MAX_MESSAGE_BYTES).fill(9))!;
    expect(validateHmacParams(zoom.params)).toEqual({ ok: true, value: zoom.params });
    expect(hmacLabZoom('sha512:sha-512', new Array<number>(HMAC_MAX_KEY_BYTES + 1).fill(7), [])).toBeUndefined();
  });
});
