import { describe, expect, it } from 'vitest';
import { LEGACY_MAX_MESSAGE_BYTES, legacyOps, legacyParamFields, legacyPreset, MD5_OP_NAMES, readLegacyInput, SHA1_OP_NAMES, validateLegacyParams } from './manifestKit.ts';

const NS = 'plugin.test';

describe('legacy-md manifestKit', () => {
  it('declares encoding, input and detail fields; the input limit is the message byte limit', () => {
    const fields = legacyParamFields(NS);
    expect(fields.map((field) => [field.name, field.kind])).toEqual([['encoding', 'select'], ['input', 'text'], ['detail', 'select']]);
    expect(fields[0]!.options!.map((option) => option.labelKey)).toEqual([`${NS}.param.encodingOption.utf8`, `${NS}.param.encodingOption.hex`]);
    expect(fields[1]!.maxLength).toBe(LEGACY_MAX_MESSAGE_BYTES);
    expect(fields[2]!.options!.map((option) => option.value)).toEqual(['round', 'block']);
  });

  it('labels the ops; only SHA-1 has a schedule', () => {
    expect(Object.keys(legacyOps(NS, SHA1_OP_NAMES))).toEqual(['pad', 'init', 'schedule', 'round', 'compress', 'feedForward', 'output']);
    expect(Object.keys(legacyOps(NS, MD5_OP_NAMES))).not.toContain('schedule');
    expect(legacyOps(NS, MD5_OP_NAMES).round).toEqual({ labelKey: `${NS}.op.round`, shortLabelKey: `${NS}.opShort.round` });
  });

  it('builds UTF-8 presets at round detail by default', () => {
    expect(legacyPreset(NS, 'p', 'abc')).toEqual({ id: 'p', labelKey: `${NS}.preset.p`, params: { encoding: 'utf8', input: 'abc', detail: 'round' } });
    expect(legacyPreset(NS, 'q', '', 'block').params.detail).toBe('block');
  });

  it('reads at most 320 bytes (HMAC inner call: B + 256) in either encoding, reporting errors under the namespace', () => {
    expect(LEGACY_MAX_MESSAGE_BYTES).toBe(64 + 256);
    expect(readLegacyInput(NS, 'AB cd', 'hex')).toEqual({ ok: true, value: 'abcd' });
    expect(readLegacyInput(NS, 'ä'.repeat(160), 'utf8')).toEqual({ ok: true, value: 'ä'.repeat(160) });
    expect(readLegacyInput(NS, 'ä'.repeat(161), 'utf8')).toEqual({ ok: false, error: { key: `${NS}.error.inputLength`, params: { length: 322 } } });
    expect(readLegacyInput(NS, '00'.repeat(321), 'hex')).toMatchObject({ ok: false, error: { key: `${NS}.error.inputLength` } });
    expect(readLegacyInput(NS, 1, 'utf8')).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });

  it('validates every select and ignores no field', () => {
    const params = { encoding: 'hex', input: '61 62', detail: 'block' };
    expect(validateLegacyParams(NS, params)).toEqual({ ok: true, value: { ...params, input: '6162' } });
    expect(validateLegacyParams(NS, { ...params, encoding: 'b64' })).toEqual({ ok: false, error: { key: `${NS}.error.encoding`, params: { encoding: 'b64' } } });
    expect(validateLegacyParams(NS, { ...params, detail: 'op' })).toEqual({ ok: false, error: { key: `${NS}.error.detail`, params: { detail: 'op' } } });
    expect(validateLegacyParams(NS, 'abc')).toEqual({ ok: false, error: { key: `${NS}.error.invalidParams` } });
  });
});
