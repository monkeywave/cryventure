import { describe, expect, it } from 'vitest';
import type { AnyStateFacet } from '@cryventure/viz';
import { createFixtureBundle, fixtureRegions } from '@cryventure/viz/testing';
import { WATCH_LIMIT, watchHistory, watchLevel } from './watchHistory.ts';

const fixtureFacet = () => createFixtureBundle().facets['state@default'] as AnyStateFacet;

/** One `state` byte written with `values[i]` at step i. */
function facetWriting(values: readonly number[]): AnyStateFacet {
  return {
    kind: 'state',
    schemaVersion: 1,
    regions: fixtureRegions,
    initial: { state: new Array<number>(16).fill(0), w: [] },
    steps: values.map((value) => ({ op: 'set', scope: [0], writes: [{ region: 'state', offset: 3, values: [value] }], highlights: [] })),
    keyframes: [],
  } as unknown as AnyStateFacet;
}

describe('watchHistory', () => {
  it('starts with the initial value at step -1', () => {
    expect(watchHistory(fixtureFacet(), { region: 'state', index: 0 }, -1)).toEqual([{ step: -1, value: 0 }]);
  });

  it('lists every step that changed the node, up to and including uptoStep', () => {
    const node = { region: 'state', index: 0 };
    expect(watchHistory(fixtureFacet(), node, 2)).toEqual([
      { step: -1, value: 0 },
      { step: 0, value: 0x10 },
      { step: 1, value: 0xaa },
    ]);
    expect(watchHistory(fixtureFacet(), node, 0)).toEqual([
      { step: -1, value: 0 },
      { step: 0, value: 0x10 },
    ]);
  });

  it('skips steps that do not write the node', () => {
    expect(watchHistory(fixtureFacet(), { region: 'state', index: 2 }, 2)).toEqual([
      { step: -1, value: 0 },
      { step: 0, value: 0x12 },
    ]);
    expect(watchHistory(fixtureFacet(), { region: 'w', index: 16 }, 2)).toEqual([
      { step: -1, value: 16 },
      { step: 2, value: 0xff },
    ]);
  });

  it('skips writes that leave the value unchanged', () => {
    expect(watchHistory(facetWriting([0, 5, 5, 7, 7]), { region: 'state', index: 3 }, 4)).toEqual([
      { step: -1, value: 0 },
      { step: 1, value: 5 },
      { step: 3, value: 7 },
    ]);
  });

  it('ignores uptoStep beyond the last step', () => {
    expect(watchHistory(fixtureFacet(), { region: 'state', index: 1 }, 99)).toHaveLength(3);
  });

  it('keeps only the last `limit` entries (default WATCH_LIMIT)', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    const node = { region: 'state', index: 3 };
    const all = watchHistory(facetWriting(values), node, 19);
    expect(all).toHaveLength(WATCH_LIMIT);
    expect(all.at(-1)).toEqual({ step: 19, value: 20 });
    expect(watchHistory(facetWriting(values), node, 19, 3)).toEqual([
      { step: 17, value: 18 },
      { step: 18, value: 19 },
      { step: 19, value: 20 },
    ]);
  });

  it('is empty for unknown regions or indices', () => {
    expect(watchHistory(fixtureFacet(), { region: 'nope', index: 0 }, 2)).toEqual([]);
    expect(watchHistory(fixtureFacet(), { region: 'state', index: 99 }, 2)).toEqual([]);
  });
});

describe('watchLevel', () => {
  it('maps a value to 0..1 of the element range', () => {
    expect(watchLevel(0)).toBe(0);
    expect(watchLevel(0xff)).toBe(1);
    expect(watchLevel(0x7fff, 0xffff)).toBeCloseTo(0.5, 3);
  });

  it('clamps and guards a non-positive range', () => {
    expect(watchLevel(-1)).toBe(0);
    expect(watchLevel(0x1ff)).toBe(1);
    expect(watchLevel(5, 0)).toBe(0);
  });
});
