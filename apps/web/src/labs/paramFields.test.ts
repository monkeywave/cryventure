import { describe, expect, it } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { producerRegistry } from './registry.ts';
import { choiceLabelKey, editField, HEX_HINT_KEY, hintKeyOf, mergeParams, outputLabelKey } from './paramFields.ts';
import type { LabParams } from './labSession.ts';

const aes = producerRegistry.require('aes') as PrimitiveManifest<LabParams>;
const params: LabParams = { keyHex: '000102030405060708090a0b0c0d0e0f', plaintextHex: '00112233445566778899aabbccddeeff', detail: 'op' };

describe('editField', () => {
  it('accepts and normalises valid hex', () => {
    const result = editField(aes, params, 'keyHex', '2B7E1516 28AED2A6 ABF71588 09CF4F3C');
    expect(result).toEqual({ ok: true, value: { ...params, keyHex: '2b7e151628aed2a6abf7158809cf4f3c' } });
  });

  it('returns the localized error ref for invalid input', () => {
    expect(editField(aes, params, 'keyHex', 'zz')).toEqual({ ok: false, error: { key: 'core.error.hexInvalidChar', params: { char: 'z', index: 0 } } });
    expect(editField(aes, params, 'plaintextHex', '00')).toEqual({ ok: false, error: { key: 'plugin.aes.error.plaintextLength', params: { length: 1 } } });
  });

  it('applies select values through the same validation', () => {
    expect(editField(aes, params, 'detail', 'round')).toEqual({ ok: true, value: { ...params, detail: 'round' } });
  });
});

describe('mergeParams', () => {
  it('merges a multi-field patch over the committed params and normalises it', () => {
    const result = mergeParams(aes, params, { keyHex: '2B7E1516 28AED2A6 ABF71588 09CF4F3C', detail: 'round' });
    expect(result).toEqual({ ok: true, value: { ...params, keyHex: '2b7e151628aed2a6abf7158809cf4f3c', detail: 'round' } });
  });

  it('keeps the committed params for an empty patch', () => {
    expect(mergeParams(aes, params, {})).toEqual({ ok: true, value: params });
  });

  it('returns the producer validation error for an invalid patch', () => {
    expect(mergeParams(aes, params, { plaintextHex: '00' })).toEqual({ ok: false, error: { key: 'plugin.aes.error.plaintextLength', params: { length: 1 } } });
  });

  it('does not mutate the committed params', () => {
    const committed = { ...params };
    mergeParams(aes, committed, { detail: 'round' });
    expect(committed).toEqual(params);
  });
});

describe('hintKeyOf', () => {
  it('prefers the declared hint and falls back to the generic hex hint', () => {
    expect(hintKeyOf({ name: 'keyHex', kind: 'hex', labelKey: 'l', hintKey: 'h' })).toBe('h');
    expect(hintKeyOf({ name: 'keyHex', kind: 'hex', labelKey: 'l' })).toBe(HEX_HINT_KEY);
    expect(hintKeyOf({ name: 'mode', kind: 'select', labelKey: 'l', options: [] })).toBeUndefined();
  });
});

describe('outputLabelKey', () => {
  it("uses the producer's declared output label", () => {
    expect(outputLabelKey(aes, 'ciphertext')).toBe('plugin.aes.value.ciphertext');
    expect(outputLabelKey({ outputs: { tag: { labelKey: 'plugin.x.output.tag' } } }, 'tag')).toBe('plugin.x.output.tag');
  });

  it('is undefined for an undeclared output', () => {
    expect(outputLabelKey({}, 'ciphertext')).toBeUndefined();
    expect(outputLabelKey(aes, 'unknown')).toBeUndefined();
  });
});

describe('choiceLabelKey', () => {
  const producers = producerRegistry.list();
  it('labels a select value by its option and a port value by the producer title', () => {
    expect(choiceLabelKey({ name: 'detail', kind: 'select', labelKey: 'l', options: [{ value: 'op', labelKey: 'k.op' }] }, 'op', producers)).toBe('k.op');
    expect(choiceLabelKey({ name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: 'l' }, 'aes', producers)).toBe('plugin.aes.title');
  });

  it('is undefined for unknown values, non-implementers and other kinds', () => {
    expect(choiceLabelKey({ name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey: 'l' }, 'xor', producers)).toBeUndefined();
    expect(choiceLabelKey({ name: 'keyHex', kind: 'hex', labelKey: 'l' }, '00', producers)).toBeUndefined();
  });
});
