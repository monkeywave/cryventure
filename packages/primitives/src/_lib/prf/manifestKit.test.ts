import { describe, expect, it } from 'vitest';
import { hmacMemberField, PRF_LIMITS, prfInputFields, readLabel, readMacRef, readOutputLength, readParamsRecord, readPrfInputs } from './manifestKit.ts';

const NS = 'plugin.test-prf';
const err = (name: string, params?: Record<string, number>) => ({ ok: false, error: params === undefined ? { key: `${NS}.error.${name}` } : { key: `${NS}.error.${name}`, params } });
const INPUTS = { secret: 'AB:cd', label: 'master secret', seed: '0102', length: '048' };

describe('hmacMemberField', () => {
  it('is a Mac member port field limited to HMAC', () => {
    expect(hmacMemberField(NS, 'mac')).toEqual({
      name: 'mac',
      kind: 'port',
      port: 'Mac',
      member: true,
      constructions: ['hmac'],
      labelKey: `${NS}.param.mac`,
      hintKey: `${NS}.param.macHint`,
    });
  });
});

describe('prfInputFields', () => {
  it('declares secret and seed as hex, label and length as text with byte limits', () => {
    expect(prfInputFields(NS).map(({ name, kind, maxLength }) => ({ name, kind, maxLength }))).toEqual([
      { name: 'secret', kind: 'hex', maxLength: undefined },
      { name: 'label', kind: 'text', maxLength: PRF_LIMITS.labelBytes },
      { name: 'seed', kind: 'hex', maxLength: undefined },
      { name: 'length', kind: 'text', maxLength: 3 },
    ]);
    expect(prfInputFields(NS).every((field) => field.hintKey === `${field.labelKey}Hint`)).toBe(true);
  });
});

describe('readPrfInputs', () => {
  it('normalises hex and the length', () => {
    expect(readPrfInputs(NS, INPUTS)).toEqual({ ok: true, value: { secret: 'abcd', label: 'master secret', seed: '0102', length: '48' } });
  });

  it('accepts the limits: a 1- and 256-byte secret, an empty and a 128-byte seed', () => {
    expect(readPrfInputs(NS, { ...INPUTS, secret: '00' }).ok).toBe(true);
    expect(readPrfInputs(NS, { ...INPUTS, secret: '00'.repeat(256) }).ok).toBe(true);
    expect(readPrfInputs(NS, { ...INPUTS, seed: '' }).ok).toBe(true);
    expect(readPrfInputs(NS, { ...INPUTS, seed: '00'.repeat(128) }).ok).toBe(true);
  });

  it.each([
    [{ secret: '' }, err('secretLength', { length: 0 })],
    [{ secret: '00'.repeat(257) }, err('secretLength', { length: 257 })],
    [{ secret: 'zz' }, { ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } } }],
    [{ secret: 5 }, err('invalidParams')],
    [{ seed: '00'.repeat(129) }, err('seedLength', { length: 129 })],
    [{ label: '' }, err('label')],
    [{ length: '0' }, err('length')],
  ])('rejects %j', (override, error) => {
    expect(readPrfInputs(NS, { ...INPUTS, ...override })).toEqual(error);
  });
});

describe('readLabel', () => {
  it('accepts 1 … 64 printable ASCII characters', () => {
    expect(readLabel(NS, 'a')).toEqual({ ok: true, value: 'a' });
    expect(readLabel(NS, 'x'.repeat(64))).toEqual({ ok: true, value: 'x'.repeat(64) });
    expect(readLabel(NS, 'extended master secret')).toEqual({ ok: true, value: 'extended master secret' });
  });

  it.each(['', 'x'.repeat(65), 'schlüssel', 'tab\there', 'new\nline', 7])('rejects %j', (label) => {
    expect(readLabel(NS, label)).toEqual(err('label'));
  });
});

describe('readOutputLength', () => {
  it('accepts 1 … 256 as digits only and drops leading zeros', () => {
    expect(readOutputLength(NS, '1')).toEqual({ ok: true, value: '1' });
    expect(readOutputLength(NS, '256')).toEqual({ ok: true, value: '256' });
    expect(readOutputLength(NS, '0048')).toEqual({ ok: true, value: '48' });
  });

  it.each(['0', '257', '999', '1000', '-1', '4.5', '1e2', '', 'abc', ' 048 ', '48 ', 48])('rejects %j', (length) => {
    expect(readOutputLength(NS, length)).toEqual(err('length'));
  });
});

describe('readMacRef', () => {
  it('accepts a member ref and names the field in its error', () => {
    expect(readMacRef(NS, 'sha256:hmac-sha-256', 'mac')).toEqual({ ok: true, value: 'sha256:hmac-sha-256' });
    expect(readMacRef(NS, 'sha256', 'md5Mac')).toEqual(err('md5Mac'));
    expect(readMacRef(NS, 'Bad Id:x', 'mac')).toEqual(err('mac'));
    expect(readMacRef(NS, undefined, 'mac')).toEqual(err('mac'));
  });
});

describe('readParamsRecord', () => {
  it('passes objects and rejects anything else', () => {
    expect(readParamsRecord(NS, { a: 1 })).toEqual({ ok: true, value: { a: 1 } });
    expect(readParamsRecord(NS, null)).toEqual(err('invalidParams'));
    expect(readParamsRecord(NS, 'x')).toEqual(err('invalidParams'));
  });
});
