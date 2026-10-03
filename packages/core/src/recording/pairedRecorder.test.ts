import { describe, expect, it } from 'vitest';
import type { RegionSpec } from '../facets/state.ts';
import { i18nRef } from '../i18n.ts';
import { AES_POLYNOMIAL } from '../math/gf256.ts';
import { PairedRecorder } from './pairedRecorder.ts';

type Region = 'a';
const regions: RegionSpec<Region>[] = [{ id: 'a', labelKey: 'plugin.x.region.a', elem: 'u8', shape: [1] }];
const levels = [{ labelKey: 'plugin.x.scope.phase' }, { labelKey: 'plugin.x.scope.op' }];
const math = (key: string) => ({ formula: i18nRef(key), terms: [] });

function write(recorder: PairedRecorder<Region, { op: 'w' }>, value: number, scoped: boolean): void {
  const input = { op: 'w' as const, writes: [{ region: 'a' as const, offset: 0, values: [value] }], highlights: [], narration: i18nRef('plugin.x.step') };
  if (scoped) recorder.scopedStep(input, math(`plugin.x.f${value}`));
  else recorder.step(input, math(`plugin.x.f${value}`));
}

describe('PairedRecorder', () => {
  it('pairs each state step with a math step at the same index', () => {
    const recorder = new PairedRecorder<Region, { op: 'w' }>(regions, { a: [0] }, levels);
    write(recorder, 1, false);
    recorder.enter(5);
    write(recorder, 2, true);
    write(recorder, 3, true);
    recorder.leave();

    const state = recorder.stateFacet();
    expect(state.steps.map((step) => step.scope)).toEqual([[], [5, 0], [5, 1]]);
    expect(state.scopeLevels).toEqual(levels);
    expect(recorder.stepCount).toBe(3);

    const facet = recorder.mathFacet();
    expect(facet.notation).toEqual({ field: 'gf2^8', modulus: AES_POLYNOMIAL });
    expect(facet.steps.map((step) => [step.step, step.formula.key])).toEqual([
      [0, 'plugin.x.f1'],
      [1, 'plugin.x.f2'],
      [2, 'plugin.x.f3'],
    ]);
  });

  it('records an initial narration and a step −1 math entry before step 0', () => {
    const recorder = new PairedRecorder<Region, { op: 'w' }>(regions, { a: [7] }, levels, { narration: i18nRef('plugin.x.initial', { a: 7 }), math: math('plugin.x.fInit') });
    expect(recorder.stepCount).toBe(0);
    write(recorder, 1, false);
    expect(recorder.stepCount).toBe(1);
    expect(recorder.stateFacet().initialNarration).toEqual(i18nRef('plugin.x.initial', { a: 7 }));
    expect(recorder.mathFacet().steps.map((step) => [step.step, step.formula.key])).toEqual([
      [-1, 'plugin.x.fInit'],
      [0, 'plugin.x.f1'],
    ]);
  });
});
