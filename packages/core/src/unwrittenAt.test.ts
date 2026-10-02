import { describe, expect, it } from 'vitest';
import type { RegionSpec, StateStep } from './facets/state.ts';
import { unwrittenAt } from './unwrittenAt.ts';

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
