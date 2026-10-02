import { describe, expect, it } from 'vitest';
import { readXorHex, validateXorParams, XOR_MAX_BYTES, XOR_PRESETS, xorManifest } from './manifest.ts';

const NS = 'plugin.xor';

describe('validateXorParams', () => {
  it('normalises hex', () => {
    expect(validateXorParams({ messageHex: '0xAB CD', keyHex: '01:02' })).toEqual({ ok: true, value: { messageHex: 'abcd', keyHex: '0102' } });
  });

  it('accepts 1 and 32 bytes', () => {
    expect(validateXorParams({ messageHex: 'ff', keyHex: '00' }).ok).toBe(true);
    const long = '11'.repeat(XOR_MAX_BYTES);
    expect(validateXorParams({ messageHex: long, keyHex: long }).ok).toBe(true);
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ messageHex: 1, keyHex: '00' }, { key: `${NS}.error.invalidParams` }],
    [{ messageHex: '', keyHex: '00' }, { key: `${NS}.error.messageLength`, params: { length: 0 } }],
    [{ messageHex: '00'.repeat(33), keyHex: '00' }, { key: `${NS}.error.messageLength`, params: { length: 33 } }],
    [{ messageHex: '00', keyHex: '' }, { key: `${NS}.error.keyLength`, params: { length: 0 } }],
    [{ messageHex: '0011', keyHex: '00' }, { key: `${NS}.error.lengthMismatch`, params: { message: 2, key: 1 } }],
    [{ messageHex: 'zz', keyHex: '00' }, { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } }],
  ])('rejects %j', (params, error) => {
    expect(validateXorParams(params)).toEqual({ ok: false, error });
  });
});

describe('readXorHex', () => {
  it('reports lengths outside 1..32 with the given key', () => {
    expect(readXorHex('00'.repeat(33), 'k')).toEqual({ ok: false, error: { key: 'k', params: { length: 33 } } });
    expect(readXorHex('0a', 'k')).toMatchObject({ ok: true, hex: '0a' });
  });
});

describe('xorManifest', () => {
  it('has presets that teach the XOR identities', () => {
    const byId = Object.fromEntries(XOR_PRESETS.map((preset) => [preset.id, preset.params]));
    expect(byId['zero-key']?.keyHex).toMatch(/^(00)+$/);
    expect(byId['key-equals-message']?.keyHex).toBe(byId['key-equals-message']?.messageHex);
  });

  it('lazily loads a module with run()', async () => {
    expect(typeof (await xorManifest.load()).run).toBe('function');
  });
});
