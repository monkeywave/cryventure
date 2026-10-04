import { i18nRef, scopeLevels, stateAt, zeroSnapshot, type RegionSpec } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { WordopsRecorder } from './wordopsRecorder.ts';

type Region = 'x';
const REGIONS: RegionSpec<Region>[] = [{ id: 'x', labelKey: 'plugin.test.region.x', elem: 'u8', shape: [4] }];
const LEVELS = scopeLevels('plugin.test', 'block', 'op');

function recorder() {
  return new WordopsRecorder<Region, { op: 'a' | 'b' }>(REGIONS, zeroSnapshot(REGIONS), LEVELS, i18nRef('plugin.test.step.initial'));
}
const step = (op: 'a' | 'b', value: number) => ({ op, writes: [{ region: 'x' as const, offset: 0, values: [value] }], highlights: [], narration: i18nRef(`plugin.test.step.${op}`) });
const formula = i18nRef('plugin.test.formula');

describe('WordopsRecorder', () => {
  it('returns consecutive step indices and puts each step in its own child scope', () => {
    const rec = recorder();
    expect(rec.block(0, () => [rec.op(step('a', 1)), rec.op(step('b', 2))])).toEqual([0, 1]);
    expect(rec.block(1, () => rec.op(step('a', 3)))).toBe(2);
    const facet = rec.stateFacet();
    expect(facet.steps.map((entry) => entry.scope)).toEqual([[0, 0], [0, 1], [1, 0]]);
    expect(stateAt(facet, 2)['x']).toEqual([3, 0, 0, 0]);
  });

  it('adds the scope levels and the initial narration to the state facet', () => {
    const facet = recorder().stateFacet();
    expect(facet.scopeLevels).toEqual(LEVELS);
    expect(facet.initialNarration).toEqual({ key: 'plugin.test.step.initial' });
  });

  it('records steps outside every block directly under the root, each in its own scope', () => {
    const rec = recorder();
    rec.op(step('a', 1));
    rec.op(step('b', 2));
    expect(rec.stateFacet().steps.map((entry) => entry.scope)).toEqual([[0], [1]]);
  });

  it('records a wordops step only where one is given, at the state step index', () => {
    const rec = recorder();
    rec.op(step('a', 1));
    rec.op(step('b', 2), { formula, terms: [] });
    rec.op(step('a', 3), { formula, terms: [], registers: { before: ['00'], after: ['01'] } });
    const facet = rec.wordopsFacet(32, ['a', 'b']);
    expect(facet).toMatchObject({ kind: 'wordops', schemaVersion: 1, wordBits: 32, registerNames: ['a', 'b'] });
    expect(facet.steps.map((entry) => entry.step)).toEqual([1, 2]);
    expect(facet.steps[1]!.registers).toEqual({ before: ['00'], after: ['01'] });
  });

  it('omits registerNames when none are given and returns a copy of the steps', () => {
    const rec = recorder();
    rec.op(step('a', 1), { formula, terms: [] });
    const facet = rec.wordopsFacet(64);
    expect('registerNames' in facet).toBe(false);
    rec.op(step('a', 2), { formula, terms: [] });
    expect(facet.steps).toHaveLength(1);
  });
});
