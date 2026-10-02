import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyWrites, type Snapshot, type StateFacet, type Write } from './facets/state.ts';
import { nearestKeyframe, STATE_CACHE_CAPACITY, stateAt } from './stateAt.ts';
import { RecordingTracer } from './tracer.ts';

type R = 'a' | 'b';
type Op = { op: 'w' };
const SIZES = { a: 4, b: 3 } as const;
const regions = [
  { id: 'a' as const, labelKey: 'a', elem: 'u8' as const, shape: [SIZES.a] },
  { id: 'b' as const, labelKey: 'b', elem: 'u8' as const, shape: [SIZES.b] },
];
const initial: Snapshot<R> = { a: [0, 0, 0, 0], b: [1, 1, 1] };

const writeArb: fc.Arbitrary<Write<R>> = fc
  .constantFrom<R>('a', 'b')
  .chain((region) =>
    fc.integer({ min: 0, max: SIZES[region] - 1 }).chain((offset) =>
      fc
        .array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: SIZES[region] - offset })
        .map((values) => ({ region, offset, values })),
    ),
  );
const stepsArb = fc.array(fc.array(writeArb, { maxLength: 3 }), { maxLength: 80 });

function record(steps: Write<R>[][], keyframeInterval: number): StateFacet<R, Op> {
  const tracer = new RecordingTracer<R, Op>(regions, initial, { keyframeInterval });
  for (const writes of steps) tracer.step({ op: 'w', writes, highlights: [], narration: { key: 'n' } });
  return tracer.toFacet();
}

function naiveReplay(steps: Write<R>[][], step: number): Snapshot<R> {
  return steps.slice(0, step + 1).reduce((snapshot, writes) => applyWrites(snapshot, writes), initial);
}

describe('stateAt', () => {
  it('matches naive full replay for every step (property, incl. keyframe boundaries)', () => {
    fc.assert(
      fc.property(stepsArb, fc.integer({ min: 1, max: 8 }), (steps, interval) => {
        const facet = record(steps, interval);
        for (let i = -1; i < steps.length; i++) expect(stateAt(facet, i)).toEqual(naiveReplay(steps, i));
      }),
    );
  });
  it('returns the initial snapshot for step -1', () => {
    const facet = record([[{ region: 'a', offset: 0, values: [9] }]], 4);
    expect(stateAt(facet, -1)).toBe(facet.initial);
  });
  it('returns the keyframe snapshot itself at a keyframe step', () => {
    const facet = record([[{ region: 'a', offset: 0, values: [1] }], [{ region: 'a', offset: 1, values: [2] }]], 2);
    expect(stateAt(facet, 1)).toBe(facet.keyframes[0]?.snapshot);
  });
  it('memoises results per facet', () => {
    const facet = record([[{ region: 'a', offset: 0, values: [1] }], [{ region: 'b', offset: 0, values: [2] }]], 32);
    expect(stateAt(facet, 1)).toBe(stateAt(facet, 1));
  });
  it('stays correct beyond the cache capacity', () => {
    const steps = Array.from({ length: STATE_CACHE_CAPACITY + 10 }, (_, i): Write<R>[] => [
      { region: 'a', offset: i % 4, values: [i % 256] },
    ]);
    const facet = record(steps, 32);
    for (let i = 0; i < steps.length; i++) stateAt(facet, i);
    expect(stateAt(facet, 0)).toEqual(naiveReplay(steps, 0));
  });
  it('throws for out-of-range or non-integer steps', () => {
    const facet = record([[]], 4);
    expect(() => stateAt(facet, 1)).toThrow(RangeError);
    expect(() => stateAt(facet, -2)).toThrow(RangeError);
    expect(() => stateAt(facet, 0.5)).toThrow(RangeError);
  });
});

describe('nearestKeyframe', () => {
  const keyframes = [3, 7, 11].map((step) => ({ step, snapshot: initial }));
  it('finds the last keyframe at or before the step', () => {
    expect(nearestKeyframe(keyframes, 7)?.step).toBe(7);
    expect(nearestKeyframe(keyframes, 10)?.step).toBe(7);
    expect(nearestKeyframe(keyframes, 100)?.step).toBe(11);
  });
  it('returns undefined before the first keyframe or when empty', () => {
    expect(nearestKeyframe(keyframes, 2)).toBeUndefined();
    expect(nearestKeyframe([], 5)).toBeUndefined();
  });
});
