import { describe, expect, it } from 'vitest';
import { endianManifest, padToWidth, significantBytes, validateEndianParams, widthBytes } from './manifest.ts';

const NS = 'plugin.endian';

describe('widthBytes', () => {
  it('maps u16/u32/u64 to 2/4/8 bytes', () => {
    expect([widthBytes('u16'), widthBytes('u32'), widthBytes('u64')]).toEqual([2, 4, 8]);
  });
});

describe('significantBytes / padToWidth', () => {
  it('drops leading zero bytes and pads them back to a width', () => {
    expect(Array.from(significantBytes(Uint8Array.of(0, 0, 0x12, 0)))).toEqual([0x12, 0]);
    expect(Array.from(significantBytes(Uint8Array.of(0, 0)))).toEqual([]);
    expect(Array.from(padToWidth(Uint8Array.of(0x12, 0x34), 4))).toEqual([0, 0, 0x12, 0x34]);
  });
});

describe('validateEndianParams', () => {
  it('normalises hex and pads to the width', () => {
    expect(validateEndianParams({ valueHex: '0x1234', width: 'u32' })).toEqual({ ok: true, value: { valueHex: '00001234', width: 'u32' } });
    expect(validateEndianParams({ valueHex: '00001234', width: 'u16' })).toEqual({ ok: true, value: { valueHex: '1234', width: 'u16' } });
    expect(validateEndianParams({ valueHex: '00', width: 'u16' })).toEqual({ ok: true, value: { valueHex: '0000', width: 'u16' } });
  });

  it('defaults the width to u32', () => {
    expect(validateEndianParams({ valueHex: 'ff' })).toEqual({ ok: true, value: { valueHex: '000000ff', width: 'u32' } });
  });

  it.each([
    [null, { key: `${NS}.error.invalidParams` }],
    [{ valueHex: 5, width: 'u32' }, { key: `${NS}.error.invalidParams` }],
    [{ valueHex: '12', width: 'u128' }, { key: `${NS}.error.width`, params: { width: 'u128' } }],
    [{ valueHex: '', width: 'u32' }, { key: `${NS}.error.empty` }],
    [{ valueHex: '123', width: 'u32' }, { key: 'core.error.hexOddLength', params: { length: 3 } }],
    [{ valueHex: '010203', width: 'u16' }, { key: `${NS}.error.tooWide`, params: { length: 3, bytes: 2, width: 'u16' } }],
  ])('rejects %j', (params, error) => {
    expect(validateEndianParams(params)).toEqual({ ok: false, error });
  });
});

describe('endianManifest', () => {
  it('lazily loads a module with run()', async () => {
    expect(typeof (await endianManifest.load()).run).toBe('function');
  });
});
