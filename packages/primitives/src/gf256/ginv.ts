import { braceHex, GINV_EXPONENT, ginvSteps, ginvStepTerms, highlight, i18nRef, type GinvStep, type MathContent } from '@cryventure/core';
import { gf256Recorder, NS, term, write, type Gf256Recorder } from './trace.ts';

/**
 * a⁻¹ = a²⁵⁴ by square-and-multiply (core's `ginvSteps`). The initial state holds a and the power
 * a¹ = a. Steps: one scope [exponent bit] per bit 6…0 of 254 after its leading bit (a square,
 * followed by a multiply when that bit is set), then `result`. For a = {00} the powers are all zero
 * and skipped, as in aes-sbox: the initial narration and result narrate the convention 0⁻¹ := 0 instead.
 */
export function recordGinv(a: number): { recorder: Gf256Recorder; result: number } {
  const explained = ginvSteps(a);
  const { input, result } = explained;
  const zero = input === 0;
  const hexA = braceHex(input);
  const recorder = gf256Recorder(
    ['a', 'power', 'result'],
    {
      values: { a: input, power: input },
      narration: i18nRef(`${NS}.step.ginv.${zero ? 'loadZero' : 'load'}`, { a: hexA }),
      math: { formula: i18nRef(`${NS}.formula.ginvLoad`), terms: [term('a', input, 8, 'operand'), term('power', input, 8, 'intermediate', { label: powerLabel(1) })] },
    },
    'exponentBit',
    'part',
  );
  if (!zero) recordPowers(recorder, explained.steps, input);

  recorder.step(
    {
      op: 'result',
      writes: [write('result', result)],
      highlights: [highlight('power', 'read'), highlight('result', 'write')],
      narration: zero ? i18nRef(`${NS}.step.ginv.resultZero`) : i18nRef(`${NS}.step.ginv.result`, { a: hexA, result: braceHex(result) }),
    },
    {
      formula: i18nRef(`${NS}.formula.${zero ? 'ginvResultZero' : 'ginvResult'}`),
      terms: [term('a', input, 8, 'operand'), term('result', result, 8, 'result', { op: 'result' })],
    },
  );
  return { recorder, result };
}

/** Position of the leading bit of 254 (= a¹, the start); squares follow for bits 6…0. */
const LEADING_EXPONENT_BIT = Math.floor(Math.log2(GINV_EXPONENT));

/** Each square opens the scope of the next lower exponent bit; its multiply (if any) shares it. */
function recordPowers(recorder: Gf256Recorder, steps: readonly GinvStep[], a: number): void {
  const hexA = braceHex(a);
  let bit = LEADING_EXPONENT_BIT;
  for (const step of steps) {
    if (step.op === 'square') {
      if (bit < LEADING_EXPONENT_BIT) recorder.leave();
      recorder.enter((bit -= 1));
    }
    recorder.scopedStep(powerInput(step, hexA), powerMath(step, a));
  }
  if (bit < LEADING_EXPONENT_BIT) recorder.leave();
}

const powerLabel = (exponent: number) => i18nRef(`${NS}.term.power`, { exponent });

function powerInput(step: GinvStep, hexA: string) {
  const params = { previous: step.previousExponent, exponent: step.exponent, left: braceHex(step.left), value: braceHex(step.value) };
  const isSquare = step.op === 'square';
  return {
    op: step.op,
    writes: [write('power', step.value)],
    highlights: [...(isSquare ? [] : [highlight('a' as const, 'read' as const)]), highlight('power', 'write')],
    narration: i18nRef(`${NS}.step.ginv.${step.op}`, isSquare ? params : { ...params, a: hexA }),
  };
}

function powerMath(step: GinvStep, a: number): MathContent {
  const terms = ginvStepTerms(step, { previousId: 'powerPrevious', powerLabel, base: term('a', a, 8, 'operand'), inverseRole: 'result' });
  return { formula: i18nRef(`${NS}.formula.${step.op}`, { previous: step.previousExponent, exponent: step.exponent }), terms };
}
