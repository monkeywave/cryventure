import { regionSize, type StateFacet } from './facets/state.ts';

type BlankFacet<R extends string> = Pick<StateFacet<R, { op: string }>, 'regions' | 'steps'>;

const NOTHING_UNWRITTEN: ReadonlyMap<string, ReadonlySet<number>> = new Map();

const firstWriteCache = new WeakMap<object, ReadonlyMap<string, readonly number[]>>();

function computeFirstWrites<R extends string>(facet: BlankFacet<R>): ReadonlyMap<R, readonly number[]> {
  const first = new Map<R, number[]>(
    facet.regions.filter((region) => region.initial === 'blank').map((region) => [region.id, new Array<number>(regionSize(region)).fill(Infinity)]),
  );
  facet.steps.forEach((current, stepIndex) => {
    for (const write of current.writes) {
      const steps = first.get(write.region);
      if (steps === undefined) continue;
      write.values.forEach((_, offset) => {
        const index = write.offset + offset;
        if (index < steps.length && steps[index] === Infinity) steps[index] = stepIndex;
      });
    }
  });
  return first;
}

/**
 * Per region whose spec declares `initial: 'blank'`: the step that first writes each element
 * (`Infinity` = never). Computed once per facet object (facets are immutable).
 */
export function firstWriteSteps<R extends string>(facet: BlankFacet<R>): ReadonlyMap<R, readonly number[]> {
  let first = firstWriteCache.get(facet) as ReadonlyMap<R, readonly number[]> | undefined;
  if (first === undefined) firstWriteCache.set(facet, (first = computeFirstWrites(facet)));
  return first;
}

/**
 * Element indices not yet written after `step` (-1 = initial state), per region whose spec declares
 * `initial: 'blank'`. Regions without that flag never appear (their initial values are meaningful).
 */
export function unwrittenAt<R extends string>(facet: BlankFacet<R>, step: number): ReadonlyMap<R, ReadonlySet<number>> {
  const first = firstWriteSteps(facet);
  if (first.size === 0) return NOTHING_UNWRITTEN as ReadonlyMap<R, ReadonlySet<number>>;
  const unwritten = new Map<R, ReadonlySet<number>>();
  for (const [region, steps] of first) unwritten.set(region, new Set(steps.flatMap((firstWrite, index) => (firstWrite > step ? [index] : []))));
  return unwritten;
}
