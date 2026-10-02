import { braceHex, GINV_EXPONENT, ginvSteps, highlight, i18nRef, type GinvStep, type MathContent } from '@cryventure/core';
import { gf256Recorder, NS, scopeLevels, term, write, type Gf256Recorder } from './trace.ts';

/**
 * a⁻¹ = a²⁵⁴ by square-and-multiply (core's `ginvSteps`). Steps: load at the root scope, then one
 * scope [exponent bit] per bit 6…0 of 254 after its leading bit (a square, followed by a multiply
 * when that bit is set), then `result`. For a = {00} the powers are all zero and skipped, as in
 * aes-sbox: load and result narrate the convention 0⁻¹ := 0 instead.
 */
export function recordGinv(a: number): { recorder: Gf256Recorder; result: number } {
  const explained = ginvSteps(a);
  const { input, result } = explained;
  const zero = input === 0;
  const recorder = gf256Recorder(['a', 'power', 'result'], scopeLevels('exponentBit', 'part'));
  const hexA = braceHex(input);

  recorder.step(
    {
      op: 'load',
      writes: [write('a', input), write('power', input)],
      highlights: [highlight('a', 'write'), highlight('power', 'write')],
      narration: i18nRef(`${NS}.step.ginv.${zero ? 'loadZero' : 'load'}`, { a: hexA }),
    },
    { formula: i18nRef(`${NS}.formula.ginvLoad`), terms: [term('a', input, 8, 'operand'), term('power', input, 8, 'intermediate', { label: powerLabel(1) })] },
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
  let exponent = 1;
  let bit = LEADING_EXPONENT_BIT;
  for (const step of steps) {
    if (step.op === 'square') {
      if (bit < LEADING_EXPONENT_BIT) recorder.leave();
      recorder.enter((bit -= 1));
    }
    recorder.scopedStep(powerInput(step, exponent, hexA), powerMath(step, exponent, a));
    exponent = step.exponent;
  }
  if (bit < LEADING_EXPONENT_BIT) recorder.leave();
}

const powerLabel = (exponent: number) => i18nRef(`${NS}.term.power`, { exponent });

function powerInput(step: GinvStep, previousExponent: number, hexA: string) {
  const params = { previous: previousExponent, exponent: step.exponent, left: braceHex(step.left), value: braceHex(step.value) };
  const isSquare = step.op === 'square';
  return {
    op: step.op,
    writes: [write('power', step.value)],
    highlights: [...(isSquare ? [] : [highlight('a' as const, 'read' as const)]), highlight('power', 'write')],
    narration: i18nRef(`${NS}.step.ginv.${step.op}`, isSquare ? params : { ...params, a: hexA }),
  };
}

function powerMath(step: GinvStep, previousExponent: number, a: number): MathContent {
  const before = term('powerPrevious', step.left, 8, 'operand', { label: powerLabel(previousExponent), ...(step.op === 'square' ? { op: 'square' as const } : {}) });
  const after = term('power', step.value, 8, step.exponent === GINV_EXPONENT ? 'result' : 'intermediate', { label: powerLabel(step.exponent) });
  const terms = step.op === 'square' ? [before, after] : [before, term('a', a, 8, 'operand', { op: 'mul' }), after];
  return { formula: i18nRef(`${NS}.formula.${step.op}`, { previous: previousExponent, exponent: step.exponent }), terms };
}
