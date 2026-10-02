import { describe, expect, it } from 'vitest';
import { aesManifest, AES_PARAM_FIELDS, AES_PRESETS, checkHexLength, validateAesParams } from './manifest.ts';
import vectors from './vectors/fips197.json';

const VALID = {
  keyHex: '000102030405060708090a0b0c0d0e0f',
  plaintextHex: '00112233445566778899aabbccddeeff',
};

describe('aesManifest', () => {
  it('describes the AES block cipher plugin', () => {
    expect(aesManifest).toMatchObject({
      kind: 'primitive',
      id: 'aes',
      family: 'block-cipher',
      implements: ['BlockCipher'],
      facets: ['state', 'values', 'narration'],
      i18nNamespace: 'plugin.aes',
    });
    expect(aesManifest.defaults.detail).toBe('op');
  });

  it('has presets matching the FIPS 197 vectors', () => {
    expect(AES_PRESETS.map((p) => p.id)).toEqual([
      'fips197-c1',
      'fips197-c2',
      'fips197-c3',
      'fips197-b',
    ]);
    for (const vector of vectors.appendixC) {
      const preset = AES_PRESETS.find((p) => p.id === vector.presetId);
      expect(preset?.params).toEqual({
        keyHex: vector.key,
        plaintextHex: vector.plaintext,
        detail: 'op',
      });
    }
    expect(AES_PRESETS[3]?.params.keyHex).toBe(vectors.appendixB.key);
  });

  it('validates every preset', () => {
    for (const preset of AES_PRESETS) expect(aesManifest.validate(preset.params).ok).toBe(true);
  });

  it('lazily loads a module with run()', async () => {
    const module = await aesManifest.load();
    expect(typeof module.run).toBe('function');
  });
});

describe('validateAesParams', () => {
  it('normalises hex and defaults detail to op', () => {
    expect(
      validateAesParams({
        keyHex: '00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F',
        plaintextHex: VALID.plaintextHex,
      }),
    ).toEqual({
      ok: true,
      value: { ...VALID, detail: 'op' },
    });
  });

  it.each([
    [null, { key: 'plugin.aes.error.invalidParams' }],
    [{ plaintextHex: VALID.plaintextHex }, { key: 'plugin.aes.error.invalidParams' }],
    [
      { ...VALID, keyHex: '0011' },
      { key: 'plugin.aes.error.keyLength', params: { length: 2 } },
    ],
    [
      { ...VALID, plaintextHex: '00'.repeat(17) },
      { key: 'plugin.aes.error.plaintextLength', params: { length: 17 } },
    ],
    [
      { ...VALID, keyHex: 'zz' },
      { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } },
    ],
    [
      { ...VALID, keyHex: '000' },
      { key: 'core.error.hexOddLength', params: { length: 3 } },
    ],
    [
      { ...VALID, detail: 'bit' },
      { key: 'plugin.aes.error.detail', params: { detail: 'bit' } },
    ],
  ])('rejects %j', (params, error) => {
    expect(validateAesParams(params)).toEqual({ ok: false, error });
  });
});

describe('checkHexLength', () => {
  it('accepts allowed lengths and reports others with the given key', () => {
    expect(checkHexLength('AABB', [2], 'k')).toEqual({ ok: true, hex: 'aabb' });
    expect(checkHexLength('AABB', [3], 'k')).toEqual({
      ok: false,
      error: { key: 'k', params: { length: 2 } },
    });
  });
});

describe('AES_PARAM_FIELDS', () => {
  it('describes every param in declaration order', () => {
    expect(aesManifest.paramFields).toBe(AES_PARAM_FIELDS);
    expect(AES_PARAM_FIELDS.map((field) => field.name)).toEqual(Object.keys(aesManifest.defaults));
    expect(AES_PARAM_FIELDS.map((field) => field.kind)).toEqual(['hex', 'hex', 'select']);
  });

  it('offers only detail options that validate', () => {
    const options = AES_PARAM_FIELDS.find((field) => field.name === 'detail')?.options ?? [];
    expect(options.map((option) => option.value).sort()).toEqual(['op', 'round']);
    for (const option of options) expect(validateAesParams({ ...VALID, detail: option.value }).ok).toBe(true);
  });
});
