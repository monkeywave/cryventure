import { describe, expect, it } from 'vitest';
import { inferHexFields, optionLabelKey, paramFieldKeys, paramFieldsOf, portParamFields, readOption, readProducerId, readText, type ParamField } from './params.ts';

const detail: ParamField = {
  name: 'detail',
  labelKey: 'plugin.x.param.detail',
  hintKey: 'plugin.x.param.detailHint',
  kind: 'select',
  options: [
    { value: 'op', labelKey: 'plugin.x.param.detailOption.op' },
    { value: 'round', labelKey: 'plugin.x.param.detailOption.round' },
  ],
};

describe('inferHexFields', () => {
  it('picks string defaults named …Hex in declaration order', () => {
    expect(inferHexFields({ keyHex: '00', countHex: 3, ivHex: '01', mode: 'x' }, 'plugin.x')).toEqual([
      { name: 'keyHex', labelKey: 'plugin.x.param.keyHex', kind: 'hex' },
      { name: 'ivHex', labelKey: 'plugin.x.param.ivHex', kind: 'hex' },
    ]);
  });

  it('is empty for non-object defaults', () => {
    expect(inferHexFields(null, 'plugin.x')).toEqual([]);
  });
});

describe('paramFieldsOf', () => {
  it('prefers declared fields', () => {
    expect(paramFieldsOf({ paramFields: [detail], defaults: { keyHex: '00' }, i18nNamespace: 'plugin.x' })).toEqual([detail]);
  });

  it('falls back to inferred hex fields', () => {
    expect(paramFieldsOf({ defaults: { keyHex: '00' }, i18nNamespace: 'plugin.x' }).map((field) => field.name)).toEqual(['keyHex']);
  });
});

const cipher: ParamField = { name: 'cipher', labelKey: 'plugin.x.param.cipher', kind: 'port', port: 'BlockCipher' };
const message: ParamField = { name: 'message', labelKey: 'plugin.x.param.message', kind: 'text', maxLength: 4 };

describe('paramFieldKeys', () => {
  it('does not require option keys for port fields (their options are producer titles)', () => {
    const withHostOptions: ParamField = { ...cipher, options: [{ value: 'aes', labelKey: 'plugin.aes.title' }] };
    expect(paramFieldKeys([withHostOptions, message])).toEqual(['plugin.x.param.cipher', 'plugin.x.param.message']);
  });

  it('lists label, hint and option keys', () => {
    expect(paramFieldKeys([detail])).toEqual(['plugin.x.param.detail', 'plugin.x.param.detailHint', 'plugin.x.param.detailOption.op', 'plugin.x.param.detailOption.round']);
  });
});

describe('optionLabelKey', () => {
  it('finds the option label for a value', () => {
    expect(optionLabelKey(detail, 'round')).toBe('plugin.x.param.detailOption.round');
    expect(optionLabelKey(detail, 'nope')).toBeUndefined();
  });
});

describe('readOption', () => {
  const sizes = ['u16', 'u32'] as const;

  it('accepts only the allowed options', () => {
    expect(readOption('u16', sizes)).toBe('u16');
    expect(readOption('u8', sizes)).toBeUndefined();
    expect(readOption(16, sizes)).toBeUndefined();
    expect(readOption(null, sizes, 'u32')).toBeUndefined();
  });

  it('uses the fallback only for an absent value', () => {
    expect(readOption(undefined, sizes, 'u32')).toBe('u32');
    expect(readOption(undefined, sizes)).toBeUndefined();
  });
});

describe('portParamFields', () => {
  it('keeps only port fields', () => {
    expect(portParamFields([detail, cipher, message])).toEqual([cipher]);
  });

  it('skips port fields without a port name', () => {
    expect(portParamFields([{ name: 'x', labelKey: 'k', kind: 'port' }])).toEqual([]);
  });
});

describe('readText', () => {
  it('accepts strings up to maxLength UTF-8 bytes', () => {
    expect(readText('abcd', 4)).toBe('abcd');
    expect(readText('', 4)).toBe('');
    expect(readText('a€', 4)).toBe('a€');
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(readText('ab€', 4)).toBeUndefined();
    expect(readText('abcde', 4)).toBeUndefined();
  });

  it('rejects non-strings', () => {
    expect(readText(undefined, 4)).toBeUndefined();
    expect(readText(12, 4)).toBeUndefined();
  });
});

describe('readProducerId', () => {
  it('accepts kebab-case producer ids', () => {
    expect(readProducerId('aes')).toBe('aes');
    expect(readProducerId('aes-sbox')).toBe('aes-sbox');
  });

  it('rejects anything else', () => {
    expect(readProducerId('AES')).toBeUndefined();
    expect(readProducerId('')).toBeUndefined();
    expect(readProducerId('a--b')).toBeUndefined();
    expect(readProducerId(7)).toBeUndefined();
  });
});
