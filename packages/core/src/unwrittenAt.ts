import { regionSize, type StateFacet } from './facets/state.ts';

const NOTHING_UNWRITTEN: ReadonlyMap<string, ReadonlySet<number>> = new Map();

/**
 * Element indices not yet written after `step` (-1 = initial state), per region whose spec declares
 * `initial: 'blank'`. Regions without that flag never appear (their initial values are meaningful).
 */
export function unwrittenAt<R extends string>(facet: Pick<StateFacet<R, { op: string }>, 'regions' | 'steps'>, step: number): ReadonlyMap<R, ReadonlySet<number>> {
  const blank = facet.regions.filter((region) => region.initial === 'blank');
  if (blank.length === 0) return NOTHING_UNWRITTEN as ReadonlyMap<R, ReadonlySet<number>>;
  const unwritten = new Map<R, Set<number>>(blank.map((region) => [region.id, new Set(Array.from({ length: regionSize(region) }, (_, index) => index))]));
  for (const current of facet.steps.slice(0, Math.max(0, step + 1))) {
    for (const write of current.writes) {
      const indices = unwritten.get(write.region);
      write.values.forEach((_, offset) => indices?.delete(write.offset + offset));
    }
  }
  return unwritten;
}
