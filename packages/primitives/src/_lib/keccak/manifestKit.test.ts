import { describe, expect, it } from 'vitest';
import { isCshakeId, KECCAK_ALGORITHM_IDS, readSha3Input, SHA3_OP_NAMES, sha3Ops, sha3ParamFields, validateSha3Params, type Sha3Params } from './manifestKit.ts';

const NS = 'plugin.sha3';
const VALID: Sha3Params = { algorithm: 'sha3-256', encoding: 'utf8', input: 'abc', outputLength: '32', functionName: '', customization: '', detail: 'mapping' };
const errorKey = (params: unknown) => {
  const result = validateSha3Params(NS, params);
  return result.ok ? undefined : result.error.key;
};

describe('validateSha3Params', () => {
  it('accepts valid params and normalises hex input', () => {
    expect(validateSha3Params(NS, VALID)).toEqual({ ok: true, value: VALID });
    const hex = validateSha3Params(NS, { ...VALID, encoding: 'hex', input: 'A3 a3' });
    expect(hex.ok && hex.value.input).toBe('a3a3');
  });

  it('defaults missing N, S and output length', () => {
    const { functionName: _n, customization: _s, outputLength: _o, ...rest } = VALID;
    expect(validateSha3Params(NS, rest)).toEqual({ ok: true, value: VALID });
  });

  it.each([
    [null, 'invalidParams'],
    [{ ...VALID, algorithm: 'md5' }, 'algorithm'],
    [{ ...VALID, encoding: 'b64' }, 'encoding'],
    [{ ...VALID, detail: 'bit' }, 'detail'],
    [{ ...VALID, outputLength: '17' }, 'outputLength'],
    [{ ...VALID, input: 'x'.repeat(401) }, 'inputLength'],
    [{ ...VALID, encoding: 'hex', input: 'a3'.repeat(401) }, 'inputLength'],
    [{ ...VALID, input: 7 }, 'invalidParams'],
    [{ ...VALID, algorithm: 'cshake128', functionName: 'n'.repeat(65) }, 'functionNameLength'],
    [{ ...VALID, algorithm: 'cshake256', customization: 's'.repeat(65) }, 'customizationLength'],
    [{ ...VALID, customization: 7 }, 'invalidParams'],
    [{ ...VALID, customization: 'x' }, 'customizationNotCshake'],
    [{ ...VALID, algorithm: 'shake128', functionName: 'KMAC' }, 'customizationNotCshake'],
  ])('rejects %j with %s', (params, name) => {
    expect(errorKey(params)).toBe(`${NS}.error.${name}`);
  });

  it('accepts 400-byte input (SHA3-224 HMAC inner call: rate 144 + 256) and N/S for cSHAKE', () => {
    expect(errorKey({ ...VALID, encoding: 'hex', input: 'a3'.repeat(400) })).toBeUndefined();
    expect(errorKey({ ...VALID, algorithm: 'cshake128', functionName: 'KMAC', customization: 'x'.repeat(64) })).toBeUndefined();
  });
});

describe('manifest parts', () => {
  it('readSha3Input rejects non-strings', () => {
    expect(readSha3Input(NS, undefined, 'utf8').ok).toBe(false);
  });

  it('isCshakeId is true for cSHAKE only', () => {
    expect(KECCAK_ALGORITHM_IDS.filter(isCshakeId)).toEqual(['cshake128', 'cshake256']);
  });

  it('declares seven param fields and a label per op', () => {
    expect(sha3ParamFields(NS).map((field) => [field.name, field.kind])).toEqual([
      ['algorithm', 'select'],
      ['encoding', 'select'],
      ['input', 'text'],
      ['outputLength', 'select'],
      ['functionName', 'text'],
      ['customization', 'text'],
      ['detail', 'select'],
    ]);
    expect(Object.keys(sha3Ops(NS))).toEqual([...SHA3_OP_NAMES]);
  });
});
