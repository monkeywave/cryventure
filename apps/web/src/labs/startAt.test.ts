import { describe, expect, it } from 'vitest';
import type { AnyStateStep } from '@cryventure/viz';
import { initialStep, isLabMode, parseStartAt, resolveStartAt } from './startAt.ts';

const step = (op: string, round: number): AnyStateStep => ({ op, round, scope: [round, 0], writes: [], highlights: [], narration: { key: 'n' } }) as AnyStateStep;
const STEPS = [step('input', 0), step('addRoundKey', 0), step('subBytes', 1), step('shiftRows', 1), step('subBytes', 2)];

describe('parseStartAt', () => {
  it('parses field matches with numeric and text values', () => {
    expect(parseStartAt('round:1,op:subBytes')).toEqual({ kind: 'match', fields: { round: 1, op: 'subBytes' } });
    expect(parseStartAt(' op:shiftRows ')).toEqual({ kind: 'match', fields: { op: 'shiftRows' } });
  });

  it('parses step:N as the displayed (1-based) step', () => {
    expect(parseStartAt('step:12')).toEqual({ kind: 'step', step: 11 });
    expect(parseStartAt('step:0')).toEqual({ kind: 'step', step: -1 });
  });

  it.each(['', 'round', 'round:', ':1', 'round:1,,op:x', 'round:1,round:2', 'step:-1', 'step:x', 'step:2,op:x', 'op:a b'])('rejects %j', (text) => {
    expect(parseStartAt(text)).toBeUndefined();
  });
});

describe('resolveStartAt', () => {
  it('finds the first step matching every field', () => {
    expect(resolveStartAt(parseStartAt('round:1,op:subBytes'), STEPS)).toBe(2);
    expect(resolveStartAt(parseStartAt('op:subBytes'), STEPS)).toBe(2);
    expect(resolveStartAt(parseStartAt('round:2,op:subBytes'), STEPS)).toBe(4);
  });

  it('falls back to the initial step without a match or startAt', () => {
    expect(resolveStartAt(parseStartAt('round:9,op:subBytes'), STEPS)).toBe(-1);
    expect(resolveStartAt(undefined, STEPS)).toBe(-1);
  });

  it('maps the displayed step:N to its index (clamping is left to store.seek)', () => {
    expect(resolveStartAt(parseStartAt('step:3'), STEPS)).toBe(2);
    expect(resolveStartAt(parseStartAt('step:99'), STEPS)).toBe(98);
    expect(resolveStartAt(parseStartAt('step:0'), STEPS)).toBe(-1);
  });
});

describe('initialStep', () => {
  it("prefers the deep link's step over startAt", () => {
    expect(initialStep(3, parseStartAt('op:subBytes'), STEPS)).toBe(3);
    expect(initialStep(-1, parseStartAt('op:subBytes'), STEPS)).toBe(-1);
    expect(initialStep(undefined, parseStartAt('op:subBytes'), STEPS)).toBe(2);
  });
});

describe('isLabMode', () => {
  it('accepts story and debugger only', () => {
    expect(isLabMode('story')).toBe(true);
    expect(isLabMode('debugger')).toBe(true);
    expect(isLabMode('auto')).toBe(false);
    expect(isLabMode(undefined)).toBe(false);
  });
});
