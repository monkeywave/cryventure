import { AES_POLYNOMIAL, braceHex, highlight, i18nRef, xtimeSteps } from '@cryventure/core';
import { gf256Recorder, NS, term, write, type Gf256Initial, type Gf256Recorder } from './trace.ts';

/**
 * xtime(a) = a·x in two steps (scope [step]) after the initial state holds a: shift left into 9
 * bits, then reduce (⊕ {11b} iff bit 8 is set). Math comes from core's `xtimeSteps`.
 */
export function recordXtime(a: number): { recorder: Gf256Recorder; result: number } {
  const { input, shifted, carry, result } = xtimeSteps(a);
  const reduced = carry === 1;
  const hex = { a: braceHex(input), result: braceHex(result) };
  const recorder = gf256Recorder(['a', 'shifted', 'result'], xtimeInitial(input), 'step');

  recorder.scopedStep(
    {
      op: 'shift',
      writes: [write('shifted', shifted)],
      highlights: [highlight('a', 'read'), highlight('shifted', carry ? 'carry' : 'write')],
      narration: i18nRef(`${NS}.step.xtime.${carry ? 'shiftCarry' : 'shiftNoCarry'}`, { a: hex.a, shifted: braceHex(shifted, 3) }),
    },
    {
      formula: i18nRef(`${NS}.formula.shift`),
      terms: [term('a', input, 8, 'operand', { bits: [7] }), term('shifted', shifted, 9, 'intermediate', { op: 'shift', bits: [8], carryBit: 8 })],
    },
  );

  const reduceTerms = [
    term('shifted', shifted, 9, 'intermediate', { bits: [8] }),
    term('carry', carry, 1, 'carry', { bits: [0] }),
    ...(reduced ? [term('modulus', AES_POLYNOMIAL, 9, 'constant', { op: 'reduce', bits: [8] })] : []),
    term('result', result, 8, 'result', { op: 'result' }),
  ];
  recorder.scopedStep(
    {
      op: 'reduce',
      writes: [write('result', result)],
      highlights: [highlight('shifted', 'read'), highlight('result', reduced ? 'xor' : 'write')],
      narration: i18nRef(`${NS}.step.xtime.${reduced ? 'reduce' : 'noReduce'}`, hex),
    },
    { formula: i18nRef(`${NS}.formula.${reduced ? 'reduce' : 'noReduce'}`), terms: reduceTerms },
  );
  return { recorder, result };
}

/** The initial state holds a; its math marks bit 7, the one a shift would carry out. */
function xtimeInitial(a: number): Gf256Initial {
  return {
    values: { a },
    narration: i18nRef(`${NS}.step.xtime.load`, { a: braceHex(a) }),
    math: { formula: i18nRef(`${NS}.formula.xtimeLoad`), terms: [term('a', a, 8, 'operand', { bits: [7] })] },
  };
}
