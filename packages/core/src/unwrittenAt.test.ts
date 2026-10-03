import { describe, expect, it } from 'vitest';
import type { RegionSpec, StateStep } from './facets/state.ts';
import { firstWriteSteps, unwrittenAt } from './unwrittenAt.ts';

type Region = 'input' | 'output' | 'fixed';
const regions: RegionSpec<Region>[] = [
  { id: 'input', labelKey: 'l', elem: 'u8', shape: [2], initial: 'blank' },
  { id: 'output', labelKey: 'l', elem: 'u8', shape: [3], initial: 'blank' },
  { id: 'fixed', labelKey: 'l', elem: 'u8', shape: [2] },
];
const step = (writes: StateStep<Region, { op: string }>['writes']): StateStep<Region, { op: string }> => ({ op: 'x', scope: [], writes, highlights: [], narration: { key: 'n' } });
const steps = [step([{ region: 'input', offset: 0, values: [1, 2] }]), step([{ region: 'output', offset: 1, values: [9] }]), step([{ region: 'fixed', offset: 0, values: [5] }])];

describe('unwrittenAt', () => {
  it('marks every element of a blank region unwritten at the initial state', () => {
    const unwritten = unwrittenAt({ regions, steps }, -1);
    expect([...(unwritten.get('input') ?? [])]).toEqual([0, 1]);
    expect([...(unwritten.get('output') ?? [])]).toEqual([0, 1, 2]);
  });

  it('removes elements as steps up to and including `step` write them', () => {
    expect(unwrittenAt({ regions, steps }, 0).get('input')?.size).toBe(0);
    expect([...(unwrittenAt({ regions, steps }, 0).get('output') ?? [])]).toEqual([0, 1, 2]);
    expect([...(unwrittenAt({ regions, steps }, 1).get('output') ?? [])]).toEqual([0, 2]);
  });

  it('never lists regions whose initial values are meaningful', () => {
    expect(unwrittenAt({ regions, steps }, -1).has('fixed')).toBe(false);
    expect(unwrittenAt({ regions: [regions[2]!], steps }, -1).size).toBe(0);
  });
});

describe('firstWriteSteps', () => {
  it('gives each blank-region element the step that first writes it (Infinity = never)', () => {
    const facet = { regions, steps: [...steps, step([{ region: 'input', offset: 1, values: [0] }])] };
    const first = firstWriteSteps(facet);
    expect(first.get('input')).toEqual([0, 0]);
    expect(first.get('output')).toEqual([Infinity, 1, Infinity]);
    expect(first.has('fixed')).toBe(false);
  });

  it('is computed once per facet', () => {
    const facet = { regions, steps };
    expect(firstWriteSteps(facet)).toBe(firstWriteSteps(facet));
    expect(firstWriteSteps({ regions, steps })).not.toBe(firstWriteSteps(facet));
  });
});

describe('unwrittenAt (cached)', () => {
  it('agrees with a replay from step 0 at every step', () => {
    const facet = { regions, steps };
    const replay = (upto: number) => {
      const written = new Set(steps.slice(0, upto + 1).flatMap((s) => s.writes.flatMap((w) => w.values.map((_, o) => `${w.region}:${w.offset + o}`))));
      return { input: [0, 1].filter((i) => !written.has(`input:${i}`)), output: [0, 1, 2].filter((i) => !written.has(`output:${i}`)) };
    };
    for (let at = -1; at < steps.length + 1; at++) {
      const unwritten = unwrittenAt(facet, at);
      expect({ input: [...unwritten.get('input')!], output: [...unwritten.get('output')!] }).toEqual(replay(at));
    }
  });
});
