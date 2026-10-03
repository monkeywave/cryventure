import { describe, expect, it } from 'vitest';
import { i18nRef } from '../i18n.ts';
import { ginvSteps } from '../math/gf256Steps.ts';
import { ginvStepTerms, type GinvTermStyle } from './ginvTerms.ts';
import { mathTerm } from './stepParts.ts';

const powerLabel = (exponent: number) => i18nRef('plugin.x.term.power', { exponent });
const base = mathTerm('a', i18nRef('plugin.x.term.a'), 0x53, 8, 'operand');
const style: GinvTermStyle = { previousId: 'previous', powerLabel, base };
const { steps } = ginvSteps(0x53);

describe('ginvStepTerms', () => {
  it('lists a square as previous power (op square) and new power', () => {
    const [square] = steps;
    expect(ginvStepTerms(square!, style)).toEqual([
      { id: 'previous', label: powerLabel(1), value: 0x53, width: 8, role: 'operand', op: 'square' },
      { id: 'power', label: powerLabel(2), value: square!.value, width: 8, role: 'intermediate' },
    ]);
  });

  it('lists a multiply as previous power, base (op mul) and new power', () => {
    const multiply = steps[1]!;
    expect(ginvStepTerms(multiply, style)).toEqual([
      { id: 'previous', label: powerLabel(2), value: multiply.left, width: 8, role: 'operand' },
      { ...base, op: 'mul' },
      { id: 'power', label: powerLabel(3), value: multiply.value, width: 8, role: 'intermediate' },
    ]);
  });

  it('gives only the final power a^254 the inverse role', () => {
    const roles = (inverseRole?: 'result') => steps.map((step) => ginvStepTerms(step, { ...style, inverseRole }).at(-1)!.role);
    expect(roles('result')).toEqual([...new Array(steps.length - 1).fill('intermediate'), 'result']);
    expect(roles()).toEqual(new Array(steps.length).fill('intermediate'));
  });
});
