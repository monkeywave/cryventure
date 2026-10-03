import type { MathTerm, MathTermRole } from '../facets/math.ts';
import type { Highlight, HighlightKind } from '../facets/state.ts';
import type { I18nRef } from '../i18n.ts';

/** Building blocks producers share when recording steps: highlights and math terms. */

const ONLY_ELEMENT: readonly number[] = [0];

/** A highlight of `indices` in `region` (default: the single element of a one-element region). */
export function highlight<R extends string>(region: R, kind: HighlightKind, indices: readonly number[] = ONLY_ELEMENT): Highlight<R> {
  return { region, indices: [...indices], kind };
}

export type MathTermOptions = Pick<MathTerm, 'op' | 'bits' | 'carryBit'>;

/** A math term; `op`, `bits` and `carryBit` are only set when given (the facet omits absent optionals). */
export function mathTerm(id: string, label: I18nRef, value: number, width: number, role: MathTermRole, options: MathTermOptions = {}): MathTerm {
  const { op, bits, carryBit } = options;
  return {
    id,
    label,
    value,
    width,
    role,
    ...(op === undefined ? {} : { op }),
    ...(bits === undefined ? {} : { bits }),
    ...(carryBit === undefined ? {} : { carryBit }),
  };
}
