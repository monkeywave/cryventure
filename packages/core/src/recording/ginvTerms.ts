import type { MathTerm, MathTermRole } from '../facets/math.ts';
import type { I18nRef } from '../i18n.ts';
import { GINV_EXPONENT, type GinvStep } from '../math/gf256Steps.ts';
import { mathTerm } from './stepParts.ts';

const BYTE_WIDTH = 8;

/** How a producer names the terms of one square-and-multiply step (its i18n keys stay its own). */
export interface GinvTermStyle {
  /** Id of the running power before the step; the new power is always `power`. */
  previousId: string;
  /** Label of the power a^exponent. */
  powerLabel: (exponent: number) => I18nRef;
  /** The base a; a multiply lists it (with op `mul`) between the two powers. */
  base: MathTerm;
  /** Role of the final power a²⁵⁴ = a⁻¹ (default `intermediate`, like every other power). */
  inverseRole?: MathTermRole;
}

/**
 * Math terms of one `ginvSteps` step: a square is `[previous (op square), power]`, a multiply
 * `[previous, base (op mul), power]`, where previous = a^previousExponent and power = a^exponent.
 */
export function ginvStepTerms(step: GinvStep, style: GinvTermStyle): MathTerm[] {
  const { previousId, powerLabel, base, inverseRole = 'intermediate' } = style;
  const isSquare = step.op === 'square';
  const previous = mathTerm(previousId, powerLabel(step.previousExponent), step.left, BYTE_WIDTH, 'operand', isSquare ? { op: 'square' } : {});
  const powerRole = step.exponent === GINV_EXPONENT ? inverseRole : 'intermediate';
  const power = mathTerm('power', powerLabel(step.exponent), step.value, BYTE_WIDTH, powerRole);
  return isSquare ? [previous, power] : [previous, { ...base, op: 'mul' }, power];
}
