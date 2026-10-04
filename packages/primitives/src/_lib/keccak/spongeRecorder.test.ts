import { i18nRef, scopeLevels } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { initialSnapshot } from '../sha2/regions.ts';
import type { Sha3OpName } from './manifestKit.ts';
import { SpongeRecorder } from './spongeRecorder.ts';
import { spongeRegions } from './spongeRecording.ts';
import type { SpongeRegion } from './spongeSteps.ts';

const NARRATION = i18nRef('plugin.sha3.step.output');
const LANES = new Array<string>(25).fill('0000000000000000');
const LEVELS = scopeLevels('plugin.sha3', 'block', 'round', 'op');

function recorder(): SpongeRecorder<SpongeRegion, Sha3OpName> {
  const regions = spongeRegions('plugin.sha3', 136, 32);
  return new SpongeRecorder<SpongeRegion, Sha3OpName>(regions, initialSnapshot(regions, {}), i18nRef('plugin.sha3.step.initial'));
}

describe('SpongeRecorder', () => {
  it('records flat steps in the current scope and scoped steps one level deeper, each with its sponge step', () => {
    const rec = recorder();
    rec.scope(0, () => {
      rec.step({ op: 'pad', writes: [], highlights: [], narration: NARRATION }, { phase: 'pad', lanes: LANES });
      rec.scope(7, () => rec.scopedOp({ op: 'theta', writes: [], highlights: [], narration: NARRATION }, { phase: 'theta', round: 7, lanes: LANES }));
      rec.scopedOp({ op: 'squeeze', writes: [], highlights: [], narration: NARRATION }, { phase: 'squeeze', lanes: LANES });
    });
    const state = rec.stateFacet(LEVELS);
    expect(state.steps.map((step) => step.scope)).toEqual([[0], [0, 7, 0], [0, 8]]);
    expect(state.scopeLevels?.length).toBe(3);
    const sponge = rec.spongeFacet(i18nRef('plugin.sha3.sponge.label'), 17);
    expect(sponge.steps.map((step) => [step.step, step.phase])).toEqual([
      [0, 'pad'],
      [1, 'theta'],
      [2, 'squeeze'],
    ]);
    expect(sponge).toMatchObject({ kind: 'sponge', schemaVersion: 1, width: 5, height: 5, laneBits: 64, rounds: 24, rateLanes: 17 });
    expect(sponge.rhoOffsets?.length).toBe(25);
    expect(sponge.piSource?.length).toBe(25);
  });

  it('closes a scope when its body throws', () => {
    const rec = recorder();
    expect(() => rec.scope(0, () => { throw new Error('boom'); })).toThrow('boom');
    rec.step({ op: 'output', writes: [], highlights: [], narration: NARRATION }, { phase: 'output', lanes: LANES });
    expect(rec.stateFacet(LEVELS).steps[0]!.scope).toEqual([]);
  });
});
