import { AES_POLYNOMIAL, braceHex, highlight, i18nRef, xtimeSteps } from '@cryventure/core';
import { gf256Recorder, NS, scopeLevels, term, write, type Gf256Recorder } from './trace.ts';

/**
 * xtime(a) = a·x in three steps (scope [step]): load a, shift left into 9 bits, then reduce
 * (⊕ {11b} iff bit 8 is set). Math comes from core's `xtimeSteps`.
 */
export function recordXtime(a: number): { recorder: Gf256Recorder; result: number } {
  const { input, shifted, carry, reduced, result } = xtimeSteps(a);
  const recorder = gf256Recorder(['a', 'shifted', 'result'], scopeLevels('step'));
  const hex = { a: braceHex(input), result: braceHex(result) };

  recorder.scopedStep(
    { op: 'load', writes: [write('a', input)], highlights: [highlight('a', 'write')], narration: i18nRef(`${NS}.step.xtime.load`, { a: hex.a }) },
    { formula: i18nRef(`${NS}.formula.xtimeLoad`), terms: [term('a', input, 8, 'operand', { bits: [7] })] },
  );

  recorder.scopedStep(
    {
      op: 'shift',
      writes: [write('shifted', shifted)],
      highlights: [highlight('a', 'read'), highlight('shifted', carry ? 'carry' : 'write')],
      narration: i18nRef(`${NS}.step.xtime.${carry ? 'shiftCarry' : 'shiftNoCarry'}`, { a: hex.a, shifted: braceHex(shifted, 3) }),
    },
    {
      formula: i18nRef(`${NS}.formula.shift`),
      terms: [term('a', input, 8, 'operand', { bits: [7] }), term('shifted', shifted, 9, 'intermediate', { op: 'shift', bits: [8] })],
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
