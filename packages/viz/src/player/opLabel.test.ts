import { describe, expect, it } from 'vitest';
import { createTranslator } from '@cryventure/core';
import { compactOpLabel, opLabel, opLabelKey, opShortLabelKey } from './opLabel.ts';

const t = createTranslator({ 'plugin.aes.op.subBytes': 'SubBytes' });

describe('opLabelKey', () => {
  it('namespaces the op under the producer', () => {
    expect(opLabelKey('aes', 'subBytes')).toBe('plugin.aes.op.subBytes');
  });
});

describe('opLabel', () => {
  it("returns the producer's translated label", () => {
    expect(opLabel(t, 'aes', 'subBytes')).toBe('SubBytes');
  });

  it('falls back to the raw op without a message key', () => {
    expect(opLabel(t, 'aes', 'shiftRows')).toBe('shiftRows');
    expect(opLabel(t, 'des', 'subBytes')).toBe('subBytes');
  });
});

describe('compactOpLabel', () => {
  const both = createTranslator({ 'plugin.aes.op.subBytes': 'SubBytes – substitute bytes', 'plugin.aes.opShort.subBytes': 'SubBytes', 'plugin.aes.op.shiftRows': 'ShiftRows' });

  it('prefers the short label, then the op label', () => {
    expect(opShortLabelKey('aes', 'subBytes')).toBe('plugin.aes.opShort.subBytes');
    expect(compactOpLabel(both, 'aes', 'subBytes')).toBe('SubBytes');
    expect(compactOpLabel(both, 'aes', 'shiftRows')).toBe('ShiftRows');
  });

  it('is undefined when the producer has no label for the op', () => {
    expect(compactOpLabel(both, 'aes', 'mixColumns')).toBeUndefined();
  });
});
