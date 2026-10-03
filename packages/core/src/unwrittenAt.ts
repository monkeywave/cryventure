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
 * One blank region's placeholder sets, one per interval between the steps where a first write
 * lands. The set only changes at those steps, so every step in an interval shares one Set.
 */
interface RegionFrontier {
  /** Sorted distinct steps that first write some element of the region. */
  readonly changes: readonly number[];
  /** Lazily built set per interval: index i = after `changes[i - 1]` and before `changes[i]`. */
  readonly sets: (ReadonlySet<number> | undefined)[];
  readonly firstWrites: readonly number[];
}

const frontierCache = new WeakMap<object, ReadonlyMap<string, RegionFrontier>>();

function regionFrontiers<R extends string>(facet: BlankFacet<R>): ReadonlyMap<R, RegionFrontier> {
  let frontiers = frontierCache.get(facet) as ReadonlyMap<R, RegionFrontier> | undefined;
  if (frontiers !== undefined) return frontiers;
  const built = new Map<R, RegionFrontier>();
  for (const [region, firstWrites] of firstWriteSteps(facet)) {
    const changes = [...new Set(firstWrites.filter(Number.isFinite))].sort((a, b) => a - b);
    built.set(region, { changes, sets: new Array(changes.length + 1), firstWrites });
  }
  frontierCache.set(facet, (frontiers = built));
  return frontiers;
}

/** Number of entries of the sorted `changes` that are <= `step` (= the interval holding `step`). */
function intervalOf(changes: readonly number[], step: number): number {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (changes[mid]! <= step) low = mid + 1;
    else high = mid;
  }
  return low;
}

function unwrittenSet(frontier: RegionFrontier, step: number): ReadonlySet<number> {
  const interval = intervalOf(frontier.changes, step);
  let set = frontier.sets[interval];
  if (set === undefined) {
    set = new Set(frontier.firstWrites.flatMap((firstWrite, index) => (firstWrite > step ? [index] : [])));
    frontier.sets[interval] = set;
  }
  return set;
}

/**
 * Element indices not yet written after `step` (-1 = initial state), per region whose spec declares
 * `initial: 'blank'`. Regions without that flag never appear (their initial values are meaningful).
 * A region's Set is the same object for every step between two of its first writes, so memoised
 * consumers skip re-rendering when its membership did not change.
 */
export function unwrittenAt<R extends string>(facet: BlankFacet<R>, step: number): ReadonlyMap<R, ReadonlySet<number>> {
  const frontiers = regionFrontiers(facet);
  if (frontiers.size === 0) return NOTHING_UNWRITTEN as ReadonlyMap<R, ReadonlySet<number>>;
  const unwritten = new Map<R, ReadonlySet<number>>();
  for (const [region, frontier] of frontiers) unwritten.set(region, unwrittenSet(frontier, step));
  return unwritten;
}
