import { describe, expect, it } from 'vitest';
import { expandKey } from './keyExpansion.ts';
import { shiftRows } from './ops.ts';
import {
  addRoundKeyStep,
  inputStep,
  keyExpansionStep,
  mixStep,
  outputStep,
  shiftStep,
  stepKey,
  substitutionStep,
} from './steps.ts';

const STATE = Array.from({ length: 16 }, (_, i) => i);

describe('stepKey', () => {
  it('namespaces narration keys under plugin.aes.step', () => {
    expect(stepKey('subBytes')).toBe('plugin.aes.step.subBytes');
  });
});

describe('step builders', () => {
  it('inputStep writes the whole state', () => {
    const step = inputStep(0, STATE);
    expect(step.writes).toEqual([{ region: 'state', offset: 0, values: STATE }]);
    expect(step.narration.key).toBe('plugin.aes.step.input');
  });

  it('keyExpansionStep writes all words into w', () => {
    const words = expandKey(new Array<number>(16).fill(0));
    const step = keyExpansionStep(0, words, 4);
    expect(step.writes[0]?.values).toHaveLength(176);
    expect(step.narration.params).toEqual({ words: 44, keyWords: 4 });
  });

  it('addRoundKeyStep loads the round key, xors the state and reads the schedule slice', () => {
    const step = addRoundKeyStep(2, 2, STATE, STATE);
    expect(step.writes.map((write) => write.region)).toEqual(['roundKey', 'state']);
    expect(step.highlights.map((h) => h.kind)).toEqual(['read', 'read', 'xor']);
    expect(step.highlights[0]?.indices[0]).toBe(32);
    expect(step.narration.params).toEqual({ round: 2, roundKey: 2 });
  });

  it('substitutionStep and mixStep highlight the state', () => {
    expect(substitutionStep('invSubBytes', 4, STATE).highlights[0]?.kind).toBe('sbox');
    expect(mixStep('mixColumns', 4, STATE)).toMatchObject({ op: 'mixColumns', round: 4 });
  });

  it('shiftStep carries the moves and highlights their targets', () => {
    const { state, moves } = shiftRows(STATE);
    const step = shiftStep('shiftRows', 1, state, moves);
    expect(step).toMatchObject({ op: 'shiftRows', moves });
    expect(step.highlights[0]).toMatchObject({ kind: 'move', indices: moves.map((m) => m.to) });
  });

  it('outputStep only reads', () => {
    expect(outputStep(10)).toMatchObject({ op: 'output', writes: [], round: 10 });
  });
});
