import { RecordingTracer, regionSize } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  AES_SCOPE_LEVELS,
  AesTraceEmitter,
  aesRegions,
  emptySnapshot,
  type AesOp,
  type AesRegion,
  type AesStep,
} from './aesTrace.ts';

function sampleStep(value: number): AesStep {
  return {
    op: 'subBytes',
    round: 1,
    writes: [{ region: 'state', offset: 0, values: new Array<number>(16).fill(value) }],
    highlights: [],
    narration: { key: 'plugin.aes.step.subBytes', params: { round: 1 } },
  };
}

function newTracer(): RecordingTracer<AesRegion, AesOp> {
  return new RecordingTracer<AesRegion, AesOp>(aesRegions(10), emptySnapshot(10));
}

describe('aesRegions / emptySnapshot', () => {
  it('declares state, roundKey and an (Nr+1)·4 × 4 key schedule matching the snapshot', () => {
    const regions = aesRegions(14);
    expect(regions.map((region) => region.id)).toEqual(['state', 'roundKey', 'w']);
    expect(regions[2]?.shape).toEqual([60, 4]);
    const snapshot = emptySnapshot(14);
    for (const region of regions) expect(snapshot[region.id]).toHaveLength(regionSize(region));
  });

  it('hints grids for state and round key and 4-byte words (4 per round key) for the schedule', () => {
    expect(aesRegions(10).map((region) => region.layout)).toEqual([
      { kind: 'grid' },
      { kind: 'grid' },
      { kind: 'words', wordBytes: 4, labelPrefix: 'w', wordsPerGroup: 4 },
    ]);
  });
});

describe('AesTraceEmitter', () => {
  it("emits one step per op in scope [round, opIndex] at 'op' detail", () => {
    const tracer = newTracer();
    const emitter = new AesTraceEmitter(tracer, 'op');
    emitter.beginRound(3);
    emitter.emit(() => sampleStep(1));
    emitter.emit(() => sampleStep(2));
    emitter.endRound(3, { key: 'plugin.aes.step.round', params: { round: 3 } });
    expect(tracer.toFacet().steps.map((step) => step.scope)).toEqual([
      [3, 0],
      [3, 1],
    ]);
  });

  it("merges a round into one 'round' step in scope [round] at 'round' detail", () => {
    const tracer = newTracer();
    const emitter = new AesTraceEmitter(tracer, 'round');
    emitter.beginRound(2);
    emitter.emit(() => sampleStep(1));
    emitter.emit(() => sampleStep(2));
    emitter.endRound(2, { key: 'plugin.aes.step.round', params: { round: 2 } });
    const [step] = tracer.toFacet().steps;
    expect(tracer.toFacet().steps).toHaveLength(1);
    expect(step).toMatchObject({ op: 'round', round: 2, scope: [2] });
    expect(step?.writes).toEqual([sampleStep(2).writes[0]]);
  });

  it('never builds steps when the tracer is disabled', () => {
    const emitter = new AesTraceEmitter(
      { enabled: false, step: () => {}, enter: () => {}, leave: () => {} },
      'op',
    );
    emitter.beginRound(0);
    emitter.emit(() => {
      throw new Error('should not be called');
    });
    emitter.endRound(0, { key: 'x' });
  });
});

describe('AES_SCOPE_LEVELS', () => {
  it('labels the two scope levels round and op, with next/prev button labels', () => {
    expect(AES_SCOPE_LEVELS).toEqual([
      { labelKey: 'plugin.aes.scope.round', nextKey: 'plugin.aes.scope.roundNext', prevKey: 'plugin.aes.scope.roundPrev' },
      { labelKey: 'plugin.aes.scope.op', nextKey: 'plugin.aes.scope.opNext', prevKey: 'plugin.aes.scope.opPrev' },
    ]);
  });
});
