import type { ElemType, RegionSpec, Snapshot } from '../facets/state.ts';

/** Region helpers producers share: one-element regions and the all-zero initial snapshot. */

export interface SingleCellRegionOptions {
  /** Element type (default `u8`). */
  elem?: ElemType;
  order?: RegionSpec<string>['order'];
  /** Whether the initial value is a placeholder (`initial: 'blank'`, the default) or a real value. */
  blank?: boolean;
}

/** A one-element grid region labelled `<namespace>.region.<id>`. */
export function singleCellRegion<R extends string>(namespace: string, id: R, options: SingleCellRegionOptions = {}): RegionSpec<R> {
  const { elem = 'u8', order, blank = true } = options;
  return {
    id,
    labelKey: `${namespace}.region.${id}`,
    elem,
    shape: [1],
    ...(order === undefined ? {} : { order }),
    layout: { kind: 'grid' },
    ...(blank ? { initial: 'blank' as const } : {}),
  };
}

/** Number of elements of a region (the product of its shape). */
function elementCount(region: RegionSpec<string>): number {
  return region.shape.reduce((count, size) => count * size, 1);
}

/** An initial snapshot with every element of every region zero. */
export function zeroSnapshot<R extends string>(regions: readonly RegionSpec<R>[]): Snapshot<R> {
  return Object.fromEntries(regions.map((region) => [region.id, new Array<number>(elementCount(region)).fill(0)])) as unknown as Snapshot<R>;
}
