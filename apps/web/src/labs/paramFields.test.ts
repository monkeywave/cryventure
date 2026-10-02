import { describe, expect, it } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { producerRegistry } from './registry.ts';
import { editField, HEX_HINT_KEY, hintKeyOf, outputLabelKey } from './paramFields.ts';
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
