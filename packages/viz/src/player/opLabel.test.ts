import { describe, expect, it } from 'vitest';
import { createTranslator } from '@cryventure/core';
import { compactOpLabel, opLabel, type OpLabelMap } from './opLabel.ts';

const t = createTranslator({ 'p.subBytes': 'SubBytes – substitute bytes', 'p.subBytesShort': 'SubBytes', 'p.shiftRows': 'ShiftRows' });
const ops: OpLabelMap = { subBytes: { labelKey: 'p.subBytes', shortLabelKey: 'p.subBytesShort' }, shiftRows: { labelKey: 'p.shiftRows' } };

describe('opLabel', () => {
  it("returns the producer's translated label", () => {
    expect(opLabel(t, ops, 'subBytes')).toBe('SubBytes – substitute bytes');
  });

  it('falls back to the raw op without a declared label', () => {
    expect(opLabel(t, ops, 'mixColumns')).toBe('mixColumns');
    expect(opLabel(t, undefined, 'subBytes')).toBe('subBytes');
    expect(opLabel(t, ops, 'constructor')).toBe('constructor');
  });
});

describe('compactOpLabel', () => {
  it('prefers the short label, then the op label', () => {
    expect(compactOpLabel(t, ops, 'subBytes')).toBe('SubBytes');
    expect(compactOpLabel(t, ops, 'shiftRows')).toBe('ShiftRows');
  });

  it('is undefined when the producer declares no label for the op', () => {
    expect(compactOpLabel(t, ops, 'mixColumns')).toBeUndefined();
    expect(compactOpLabel(t, undefined, 'subBytes')).toBeUndefined();
  });
});
