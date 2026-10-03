import { AES_POLYNOMIAL, braceHex, gmulSteps, highlight, i18nRef, type GmulBitStep, type MathContent, type MathTerm } from '@cryventure/core';
import { gf256Recorder, NS, setBits, term, write, type Gf256Recorder } from './trace.ts';

/**
 * a • b by shift-and-add over the bits of b (core's `gmulSteps`). The initial state holds a, b, the
 * addend a·x⁰ = a and the accumulator {00}. Steps: per bit i of b a scope [i] holding `xtime`
 * (a·xⁱ from a·xⁱ⁻¹, for i ≥ 1) and `add`/`skip`, then `result` at the root scope.
 */
export function recordGmul(a: number, b: number): { recorder: Gf256Recorder; result: number } {
  const explained = gmulSteps(a, b);
  const hex = { a: braceHex(explained.a), b: braceHex(explained.b) };
  const recorder = gf256Recorder(
    ['a', 'b', 'addend', 'acc'],
    {
      values: { a: explained.a, b: explained.b, addend: explained.a, acc: 0 },
      narration: i18nRef(`${NS}.step.gmul.load`, hex),
      math: {
        formula: i18nRef(`${NS}.formula.gmulLoad`),
        terms: [term('a', explained.a, 8, 'operand'), term('b', explained.b, 8, 'operand', { bits: setBits(explained.b) })],
      },
    },
    'bit',
    'part',
  );

  let previous: GmulBitStep | undefined;
  for (const bitStep of explained.bits) {
    recorder.enter(bitStep.bit);
    if (previous !== undefined) recorder.scopedStep(xtimeInput(previous, bitStep), xtimeMath(previous, bitStep));
    const accBefore = previous?.acc ?? 0;
    recorder.scopedStep(addInput(bitStep, accBefore), addMath(explained.b, bitStep, accBefore));
    recorder.leave();
    previous = bitStep;
  }

  const { result } = explained;
  recorder.step(
    { op: 'result', writes: [], highlights: [highlight('acc', 'read')], narration: i18nRef(`${NS}.step.gmul.result`, { ...hex, result: braceHex(result) }) },
    {
      formula: i18nRef(`${NS}.formula.gmulResult`),
      terms: [term('a', explained.a, 8, 'operand'), term('b', explained.b, 8, 'operand', { op: 'mul' }), term('result', result, 8, 'result', { op: 'result' })],
    },
  );
  return { recorder, result };
}

const addendLabel = (bit: number) => i18nRef(`${NS}.term.addend`, { bit });

function xtimeInput(previous: GmulBitStep, current: GmulBitStep) {
  const params = { bit: current.bit, previous: braceHex(previous.addend), addend: braceHex(current.addend) };
  const reduced = current.carry === 1;
  return {
    op: 'xtime' as const,
    writes: [write('addend', current.addend)],
    highlights: [highlight('addend', reduced ? 'carry' : 'write')],
    narration: i18nRef(`${NS}.step.gmul.${reduced ? 'xtimeReduce' : 'xtimeShift'}`, params),
  };
}

function xtimeMath(previous: GmulBitStep, current: GmulBitStep): MathContent {
  const shifted = previous.addend << 1;
  const reduced = current.carry === 1;
  const terms: MathTerm[] = [
    term('addendPrevious', previous.addend, 8, 'operand', { label: addendLabel(previous.bit), bits: [7] }),
    term('shifted', shifted, 9, 'intermediate', { op: 'shift', bits: [8], carryBit: 8 }),
    ...(reduced ? [term('modulus', AES_POLYNOMIAL, 9, 'constant', { op: 'reduce', bits: [8] })] : []),
    term('addend', current.addend, 8, 'intermediate', { label: addendLabel(current.bit) }),
  ];
  return { formula: i18nRef(`${NS}.formula.${reduced ? 'xtimeReduce' : 'xtimeShift'}`, { bit: current.bit }), terms };
}

function addInput(step: GmulBitStep, accBefore: number) {
  const params = { bit: step.bit, addend: braceHex(step.addend), acc: braceHex(step.acc) };
  return step.added
    ? {
        op: 'add' as const,
        writes: [write('acc', step.acc)],
        highlights: [highlight('b', 'read'), highlight('addend', 'read'), highlight('acc', 'xor')],
        narration: i18nRef(`${NS}.step.gmul.add`, params),
      }
    : {
        op: 'skip' as const,
        writes: [],
        highlights: [highlight('b', 'read'), highlight('acc', 'read')],
        narration: i18nRef(`${NS}.step.gmul.skip`, { bit: step.bit, acc: braceHex(accBefore) }),
      };
}

function addMath(b: number, step: GmulBitStep, accBefore: number): MathContent {
  const bitOfB = term('b', b, 8, 'operand', { bits: [step.bit] });
  if (!step.added) return { formula: i18nRef(`${NS}.formula.skip`, { bit: step.bit }), terms: [bitOfB, term('acc', accBefore, 8, 'intermediate')] };
  const terms = [
    bitOfB,
    term('accPrevious', accBefore, 8, 'intermediate'),
    term('addend', step.addend, 8, 'intermediate', { op: 'xor', label: addendLabel(step.bit) }),
    term('acc', step.acc, 8, 'intermediate'),
  ];
  return { formula: i18nRef(`${NS}.formula.add`, { bit: step.bit }), terms };
}
