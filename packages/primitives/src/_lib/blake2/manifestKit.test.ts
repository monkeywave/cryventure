import { describe, expect, it } from 'vitest';
import {
  BLAKE2_IDS,
  BLAKE2_MAX_MESSAGE_BYTES,
  BLAKE2_OP_NAMES,
  blake2Flavour,
  blake2MaxKeyBytes,
  blake2Ops,
  blake2OutputBytes,
  blake2ParamFields,
  readBlake2Input,
  readBlake2Key,
  validateBlake2Params,
} from './manifestKit.ts';

const NS = 'plugin.test';
const PARAMS = { algorithm: 'blake2s-256', encoding: 'utf8', input: 'abc', key: '', detail: 'g' };

describe('blake2 manifestKit', () => {
  it('derives flavour, digest bytes and key limit from the id', () => {
    expect(BLAKE2_IDS.map((id) => [blake2Flavour(id), blake2OutputBytes(id), blake2MaxKeyBytes(id)])).toEqual([
      ['blake2s', 16, 32],
      ['blake2s', 20, 32],
      ['blake2s', 28, 32],
      ['blake2s', 32, 32],
      ['blake2b', 20, 64],
      ['blake2b', 32, 64],
      ['blake2b', 48, 64],
      ['blake2b', 64, 64],
    ]);
  });

  it('declares algorithm, encoding, input, key and detail fields', () => {
    const fields = blake2ParamFields(NS);
    expect(fields.map((field) => [field.name, field.kind])).toEqual([['algorithm', 'select'], ['encoding', 'select'], ['input', 'text'], ['key', 'hex'], ['detail', 'select']]);
    expect(fields[2]!.maxLength).toBe(BLAKE2_MAX_MESSAGE_BYTES);
    expect(fields[4]!.options!.map((option) => option.value)).toEqual(['g', 'round', 'block']);
  });

  it('labels every recorded op under the namespace', () => {
    expect(Object.keys(blake2Ops(NS))).toEqual([...BLAKE2_OP_NAMES]);
    expect(blake2Ops(NS).g).toEqual({ labelKey: `${NS}.op.g`, shortLabelKey: `${NS}.opShort.g` });
  });

  it('reads at most 128 message bytes in either encoding', () => {
    expect(readBlake2Input(NS, 'AB cd', 'hex')).toEqual({ ok: true, value: 'abcd' });
    expect(readBlake2Input(NS, 'a'.repeat(128), 'utf8')).toEqual({ ok: true, value: 'a'.repeat(128) });
    expect(readBlake2Input(NS, 'ä'.repeat(65), 'utf8')).toEqual({ ok: false, error: { key: `${NS}.error.inputLength`, params: { length: 130 } } });
    expect(readBlake2Input(NS, '00'.repeat(129), 'hex')).toEqual({ ok: false, error: { key: `${NS}.error.inputLength`, params: { length: 129 } } });
    expect(readBlake2Input(NS, 1, 'utf8')).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });

  it('limits the key to 32 bytes for BLAKE2s and 64 for BLAKE2b; empty means unkeyed', () => {
    expect(readBlake2Key(NS, '', 'blake2s-256')).toEqual({ ok: true, value: '' });
    expect(readBlake2Key(NS, '00 0F', 'blake2s-128')).toEqual({ ok: true, value: '000f' });
    expect(readBlake2Key(NS, '00'.repeat(32), 'blake2s-256').ok).toBe(true);
    expect(readBlake2Key(NS, '00'.repeat(33), 'blake2s-256')).toEqual({ ok: false, error: { key: `${NS}.error.keyLength`, params: { length: 33, max: 32 } } });
    expect(readBlake2Key(NS, '00'.repeat(64), 'blake2b-512').ok).toBe(true);
    expect(readBlake2Key(NS, '00'.repeat(65), 'blake2b-160')).toEqual({ ok: false, error: { key: `${NS}.error.keyLength`, params: { length: 65, max: 64 } } });
    expect(readBlake2Key(NS, 'zz', 'blake2b-512')).toMatchObject({ ok: false, error: { key: 'core.error.hexInvalidChar' } });
    expect(readBlake2Key(NS, undefined, 'blake2b-512')).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });

  it('validates and normalises every param', () => {
    expect(validateBlake2Params(NS, PARAMS)).toEqual({ ok: true, value: PARAMS });
    expect(validateBlake2Params(NS, { ...PARAMS, key: 'AA', encoding: 'hex', input: 'FF' })).toEqual({ ok: true, value: { ...PARAMS, key: 'aa', encoding: 'hex', input: 'ff' } });
    expect(validateBlake2Params(NS, null)).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
    expect(validateBlake2Params(NS, { ...PARAMS, algorithm: 'blake2x' })).toEqual({ ok: false, error: { key: `${NS}.error.algorithm`, params: { algorithm: 'blake2x' } } });
    expect(validateBlake2Params(NS, { ...PARAMS, encoding: 'b64' })).toEqual({ ok: false, error: { key: `${NS}.error.encoding`, params: { encoding: 'b64' } } });
    expect(validateBlake2Params(NS, { ...PARAMS, detail: 'op' })).toEqual({ ok: false, error: { key: `${NS}.error.detail`, params: { detail: 'op' } } });
    expect(validateBlake2Params(NS, { ...PARAMS, input: 7 })).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
    expect(validateBlake2Params(NS, { ...PARAMS, key: '00'.repeat(40) })).toEqual({ ok: false, error: { key: `${NS}.error.keyLength`, params: { length: 40, max: 32 } } });
  });
});
