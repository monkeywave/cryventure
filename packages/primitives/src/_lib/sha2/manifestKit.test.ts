import { describe, expect, it } from 'vitest';
import { readSha2Input, SHA256_MAX_MESSAGE_BYTES, SHA512_MAX_MESSAGE_BYTES, SHA2_OP_NAMES, sha2Ops, sha2ParamFields, sha2Preset, validateSha2Params } from './manifestKit.ts';

const NS = 'plugin.test';
const IDS = ['sha-a', 'sha-b'] as const;

describe('sha2ManifestKit', () => {
  it('declares algorithm, encoding, input and detail fields; the input limit is the message byte limit', () => {
    const fields = sha2ParamFields(NS, IDS, 40);
    expect(fields.map((field) => [field.name, field.kind])).toEqual([['algorithm', 'select'], ['encoding', 'select'], ['input', 'text'], ['detail', 'select']]);
    expect(fields[0]!.options!.map((option) => option.labelKey)).toEqual([`${NS}.param.algorithmOption.sha-a`, `${NS}.param.algorithmOption.sha-b`]);
    expect(fields[2]!.maxLength).toBe(40);
  });

  it('labels every recorded op under the namespace', () => {
    expect(Object.keys(sha2Ops(NS))).toEqual([...SHA2_OP_NAMES]);
  });

  it('builds UTF-8 presets at round detail by default', () => {
    expect(sha2Preset(NS, 'p', 'sha-a', 'abc')).toEqual({ id: 'p', labelKey: `${NS}.preset.p`, params: { algorithm: 'sha-a', encoding: 'utf8', input: 'abc', detail: 'round' } });
  });

  it('limits SHA-256 to B + 256 = 320 bytes and the SHA-512 family to B + 256 = 384 (their longest HMAC hash inputs)', () => {
    expect(SHA256_MAX_MESSAGE_BYTES).toBe(64 + 256);
    expect(SHA512_MAX_MESSAGE_BYTES).toBe(128 + 256);
  });

  it('reads at most maxBytes in either encoding, reporting errors under the namespace', () => {
    expect(readSha2Input(NS, 'AB cd', 'hex', 128)).toEqual({ ok: true, value: 'abcd' });
    expect(readSha2Input(NS, '00'.repeat(384), 'hex', 384)).toEqual({ ok: true, value: '00'.repeat(384) });
    expect(readSha2Input(NS, '00'.repeat(385), 'hex', 384)).toMatchObject({ ok: false, error: { key: `${NS}.error.inputLength` } });
    expect(readSha2Input(NS, 'ä'.repeat(65), 'utf8', 128)).toEqual({ ok: false, error: { key: `${NS}.error.inputLength`, params: { length: 130 } } });
    expect(readSha2Input(NS, 1, 'utf8', 128)).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });

  it('validates the algorithm against the producer\'s own ids', () => {
    const params = { algorithm: 'sha-b', encoding: 'utf8', input: 'abc', detail: 'block' };
    expect(validateSha2Params(NS, IDS, 128, params)).toEqual({ ok: true, value: params });
    expect(validateSha2Params(NS, IDS, 128, { ...params, algorithm: 'sha-c' })).toEqual({ ok: false, error: { key: `${NS}.error.algorithm`, params: { algorithm: 'sha-c' } } });
  });
});
