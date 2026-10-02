import type { MathOp, MathTerm, MathTermRole } from '../facets/math.ts';
import type { Highlight, HighlightKind } from '../facets/state.ts';
import type { I18nRef } from '../i18n.ts';

/** Building blocks producers share when recording steps: highlights and math terms. */

const ONLY_ELEMENT: readonly number[] = [0];

/** A highlight of `indices` in `region` (default: the single element of a one-element region). */
export function highlight<R extends string>(region: R, kind: HighlightKind, indices: readonly number[] = ONLY_ELEMENT): Highlight<R> {
  return { region, indices: [...indices], kind };
}

export interface MathTermOptions {
  op?: MathOp;
  bits?: number[];
}

/** A math term; `op` and `bits` are only set when given (the facet omits absent optionals). */
export function mathTerm(id: string, label: I18nRef, value: number, width: number, role: MathTermRole, options: MathTermOptions = {}): MathTerm {
  const { op, bits } = options;
  return { id, label, value, width, role, ...(op === undefined ? {} : { op }), ...(bits === undefined ? {} : { bits }) };
}
