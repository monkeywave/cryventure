import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { highlight, mathTerm } from './stepParts.ts';

describe('highlight', () => {
  it('highlights the single element of a one-element region by default', () => {
    expect(highlight('acc', 'xor')).toEqual({ region: 'acc', indices: [0], kind: 'xor' });
  });

  it('highlights the given indices', () => {
    expect(highlight('state', 'read', [1, 2])).toEqual({ region: 'state', indices: [1, 2], kind: 'read' });
  });
});

describe('mathTerm', () => {
  const label = i18nRef('plugin.x.term.a');

  it('builds a term without the optional op and bits', () => {
    const term = mathTerm('a', label, 0x57, 8, 'operand');
    expect(term).toEqual({ id: 'a', label, value: 0x57, width: 8, role: 'operand' });
    expect('op' in term || 'bits' in term || 'carryBit' in term).toBe(false);
  });

  it('keeps op and bits when given', () => {
    expect(mathTerm('s', label, 0x1ae, 9, 'intermediate', { op: 'shift', bits: [8] })).toEqual({ id: 's', label, value: 0x1ae, width: 9, role: 'intermediate', op: 'shift', bits: [8] });
  });

  it('keeps the carry bit when given', () => {
    expect(mathTerm('s', label, 0x1ae, 9, 'intermediate', { op: 'shift', carryBit: 8 })).toEqual({ id: 's', label, value: 0x1ae, width: 9, role: 'intermediate', op: 'shift', carryBit: 8 });
  });
});
