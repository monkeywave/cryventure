import { describe, expect, it } from 'vitest';
import { KMAC_OP_NAMES, kmacOps, kmacParamFields, validateKmacParams, type KmacParams } from './manifestKit.ts';

const NS = 'plugin.kmac';
const KEY = '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f';
const VALID: KmacParams = { algorithm: 'kmac128', key: KEY, encoding: 'hex', input: '00010203', customization: '', outputLength: '32', detail: 'permutation' };
const errorKey = (params: unknown) => {
  const result = validateKmacParams(NS, params);
  return result.ok ? undefined : result.error.key;
};

describe('validateKmacParams', () => {
  it('accepts valid params and normalises the hex key and message', () => {
    expect(validateKmacParams(NS, VALID)).toEqual({ ok: true, value: VALID });
    const normalised = validateKmacParams(NS, { ...VALID, key: '40 41 4A', input: 'A3:a3' });
    expect(normalised.ok && [normalised.value.key, normalised.value.input]).toEqual(['40414a', 'a3a3']);
  });

  it('accepts an empty key, an empty message and a missing S', () => {
    const { customization: _s, ...rest } = VALID;
    expect(validateKmacParams(NS, { ...rest, key: '', input: '' })).toEqual({ ok: true, value: { ...VALID, key: '', input: '' } });
  });

  it.each([
    [null, 'invalidParams'],
    [{ ...VALID, algorithm: 'cshake128' }, 'algorithm'],
    [{ ...VALID, encoding: 'b64' }, 'encoding'],
    [{ ...VALID, outputLength: '336' }, 'outputLength'],
    [{ ...VALID, detail: 'bit' }, 'detail'],
    [{ ...VALID, key: 'aa'.repeat(65) }, 'keyLength'],
    [{ ...VALID, key: 7 }, 'invalidParams'],
    [{ ...VALID, input: 'a3'.repeat(201) }, 'inputLength'],
    [{ ...VALID, encoding: 'utf8', input: 'x'.repeat(201) }, 'inputLength'],
    [{ ...VALID, customization: 'ä'.repeat(33) }, 'customizationLength'],
    [{ ...VALID, customization: 5 }, 'invalidParams'],
  ])('rejects %j with %s', (params, name) => {
    expect(errorKey(params)).toBe(`${NS}.error.${name}`);
  });
});

describe('kmacParamFields and kmacOps', () => {
  it('declares the fields in order, the message hex-measured through encoding, S as 64-byte UTF-8 text', () => {
    const fields = kmacParamFields(NS);
    expect(fields.map((field) => field.name)).toEqual(['algorithm', 'key', 'encoding', 'input', 'customization', 'outputLength', 'detail']);
    expect(fields[3]).toMatchObject({ kind: 'text', maxLength: 200, encodingParam: 'encoding' });
    expect(fields[4]).toMatchObject({ kind: 'text', maxLength: 64 });
    expect(fields[4]!.encodingParam).toBeUndefined();
  });

  it('labels encodeKey and encodeLength before the sponge ops', () => {
    expect(KMAC_OP_NAMES.slice(0, 3)).toEqual(['encodeKey', 'encodeLength', 'pad']);
    expect(kmacOps(NS).encodeKey).toEqual({ labelKey: `${NS}.op.encodeKey`, shortLabelKey: `${NS}.opShort.encodeKey` });
  });
});
