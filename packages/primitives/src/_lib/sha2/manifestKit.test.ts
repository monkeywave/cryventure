import { describe, expect, it } from 'vitest';
import { readSha2Input, SHA2_MAX_MESSAGE_BYTES, SHA2_OP_NAMES, sha2Ops, sha2ParamFields, sha2Preset, validateSha2Params } from './manifestKit.ts';

const NS = 'plugin.test';
const IDS = ['sha-a', 'sha-b'] as const;

describe('sha2ManifestKit', () => {
  it('declares algorithm, encoding, input and detail fields; the input limit is the message byte limit', () => {
    const fields = sha2ParamFields(NS, IDS);
    expect(fields.map((field) => [field.name, field.kind])).toEqual([['algorithm', 'select'], ['encoding', 'select'], ['input', 'text'], ['detail', 'select']]);
    expect(fields[0]!.options!.map((option) => option.labelKey)).toEqual([`${NS}.param.algorithmOption.sha-a`, `${NS}.param.algorithmOption.sha-b`]);
    expect(fields[2]!.maxLength).toBe(SHA2_MAX_MESSAGE_BYTES);
  });

  it('labels every recorded op under the namespace', () => {
    expect(Object.keys(sha2Ops(NS))).toEqual([...SHA2_OP_NAMES]);
  });

  it('builds UTF-8 presets at round detail by default', () => {
    expect(sha2Preset(NS, 'p', 'sha-a', 'abc')).toEqual({ id: 'p', labelKey: `${NS}.preset.p`, params: { algorithm: 'sha-a', encoding: 'utf8', input: 'abc', detail: 'round' } });
  });

  it('reads at most 128 bytes in either encoding, reporting errors under the namespace', () => {
    expect(readSha2Input(NS, 'AB cd', 'hex')).toEqual({ ok: true, value: 'abcd' });
    expect(readSha2Input(NS, 'ä'.repeat(65), 'utf8')).toEqual({ ok: false, error: { key: `${NS}.error.inputLength`, params: { length: 130 } } });
    expect(readSha2Input(NS, 1, 'utf8')).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });

  it('validates the algorithm against the producer\'s own ids', () => {
    const params = { algorithm: 'sha-b', encoding: 'utf8', input: 'abc', detail: 'block' };
    expect(validateSha2Params(NS, IDS, params)).toEqual({ ok: true, value: params });
    expect(validateSha2Params(NS, IDS, { ...params, algorithm: 'sha-c' })).toEqual({ ok: false, error: { key: `${NS}.error.algorithm`, params: { algorithm: 'sha-c' } } });
  });
});
