import type { MathTerm, MathTermRole } from '../facets/math.ts';
import type { Highlight, HighlightKind, RegionSpec } from '../facets/state.ts';
import type { I18nRef } from '../i18n.ts';

/** Building blocks producers share when recording steps: regions, highlights and math terms. */

/**
 * One flat `u8` region per entry of `shapes` (in key order, `shapes[id]` bytes long), labelled
 * `<namespace>.region.<id>`. The `blankIds` start blank: their zeros are placeholders until a step writes them.
 */
export function u8Regions<R extends string>(namespace: string, shapes: Readonly<Record<R, number>>, blankIds: readonly R[] = []): RegionSpec<R>[] {
  return (Object.keys(shapes) as R[]).map((id) => ({
    id,
    labelKey: `${namespace}.region.${id}`,
    elem: 'u8',
    shape: [shapes[id]],
    ...(blankIds.includes(id) ? { initial: 'blank' as const } : {}),
  }));
}

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
