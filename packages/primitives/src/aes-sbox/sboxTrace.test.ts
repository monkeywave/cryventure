import { braceHex, unwrittenAt } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { PHASE, recordSboxDerivation } from './sboxTrace.ts';

const NS = 'plugin.aes-sbox';

describe('recordSboxDerivation', () => {
  it('records load, 13 powers, the inverse, 8 affine bits and the result for {53}', () => {
    const { state, inverse, sbox, inverseStep } = recordSboxDerivation(0x53);
    const ops = state.steps.map((step) => step.op);
    expect(ops).toHaveLength(24);
    expect([ops[0], ops[14], ...ops.slice(15)]).toEqual(['load', 'inverse', ...Array(8).fill('affineBit'), 'result']);
    expect(ops.slice(1, 14).filter((op) => op === 'square')).toHaveLength(7);
    expect(ops.slice(1, 14).filter((op) => op === 'multiply')).toHaveLength(6);
    expect({ inverse, sbox, inverseStep }).toEqual({ inverse: 0xca, sbox: 0xed, inverseStep: 14 });
  });

  it('nests every step in [phase, op] scopes', () => {
    const { state } = recordSboxDerivation(0x53);
    const phases = state.steps.map((step) => step.scope[0]);
    expect(phases[0]).toBe(PHASE.load);
    expect(phases.slice(1, 15).every((phase) => phase === PHASE.inversion)).toBe(true);
    expect(phases.slice(15).every((phase) => phase === PHASE.affine)).toBe(true);
    expect(state.steps.every((step) => step.scope.length === 2)).toBe(true);
    expect(state.scopeLevels?.map((level) => level.labelKey)).toEqual([`${NS}.scope.phase`, `${NS}.scope.op`]);
  });

  it('narrates powers with the exponent so far, ending at x^254', () => {
    const { state } = recordSboxDerivation(0x53);
    expect(state.steps[1]?.narration).toEqual({ key: `${NS}.step.square`, params: { exp: 2, value: braceHex(state.steps[1]!.writes[0]!.values[0]!) } });
    expect(state.steps[13]?.narration.params?.['exp']).toBe(254);
    expect(state.steps[13]?.writes[0]?.values).toEqual([0xca]);
  });

  it('builds the output byte bit by bit and finishes with S(x) against the table', () => {
    const { state } = recordSboxDerivation(0x53);
    const partials = state.steps.slice(15, 23).map((step) => step.writes[0]?.values[0]);
    expect(partials.at(-1)).toBe(0xed);
    partials.forEach((partial, bit) => expect((partial ?? 0) >> (bit + 1)).toBe(0));
    expect(state.steps.at(-1)?.narration).toEqual({ key: `${NS}.step.result`, params: { x: '{53}', s: '{ed}', row: '5', col: '3' } });
  });

  it('keeps math steps aligned with state steps; affine steps emphasise 5 input bits and the constant bit', () => {
    const { state, math } = recordSboxDerivation(0x53);
    const mathSteps = math.steps;
    expect(mathSteps.map((step) => step.step)).toEqual(state.steps.map((_, index) => index));
    const bit3 = mathSteps[15 + 3]!;
    expect(bit3.terms.find((term) => term.id === 'inverse')?.bits).toEqual([3, 7, 0, 1, 2]);
    expect(bit3.terms.find((term) => term.id === 'constant')).toMatchObject({ value: 0x63, role: 'constant', bits: [3] });
    expect(bit3.terms.find((term) => term.id === 'bit')?.width).toBe(1);
  });

  it('special-cases x = 0: no powers, the inverse convention, and S(0) = {63}', () => {
    const { state, inverse, sbox } = recordSboxDerivation(0);
    expect(state.steps.map((step) => step.op)).toEqual(['load', 'inverse', ...Array(8).fill('affineBit'), 'result']);
    expect(state.steps.map((step) => step.narration.key)).toEqual(
      expect.arrayContaining([`${NS}.step.loadZero`, `${NS}.step.inverseZero`, `${NS}.step.resultZero`]),
    );
    expect({ inverse, sbox }).toEqual({ inverse: 0, sbox: 0x63 });
  });
});

describe('aes-sbox blank regions', () => {
  it('keeps the affine constant as a value and the computed bytes blank until written', () => {
    const { state } = recordSboxDerivation(0x53);
    const blank = (step: number) => [...unwrittenAt(state, step).keys()].filter((id) => unwrittenAt(state, step).get(id)?.size !== 0);
    expect(blank(-1)).toEqual(['input', 'inverse', 'output']);
    expect(blank(0)).toEqual(['inverse', 'output']);
    expect(blank(state.steps.length - 1)).toEqual([]);
  });
});
