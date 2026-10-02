import { RecordingTracer, narrationFromState, type Messages, type RegionSpec, type Snapshot, type TraceBundle } from '@cryventure/core';

/** A tiny AES-shaped trace for component tests; no dependency on real primitives. */
export type FixtureRegion = 'state' | 'w';
type FixtureOp = { op: 'load' } | { op: 'sub' } | { op: 'mix' };

export const fixtureRegions: RegionSpec<FixtureRegion>[] = [
  { id: 'state', labelKey: 'fixture.region.state', elem: 'u8', shape: [4, 4], order: 'col-major' },
  { id: 'w', labelKey: 'fixture.region.w', elem: 'u8', shape: [12, 4], order: 'row-major', layout: { kind: 'words', wordBytes: 4, labelPrefix: 'w', wordsPerGroup: 4 } },
];

const range = (length: number, from = 0) => Array.from({ length }, (_, i) => from + i);

function initialSnapshot(): Snapshot<FixtureRegion> {
  return { state: new Array<number>(16).fill(0), w: range(48) };
}

/** Steps: [0] load (scope [0,0]), [1] sub (scope [1,0]), [2] mix (scope [1,1]). */
export function createFixtureBundle(): TraceBundle {
  const tracer = new RecordingTracer<FixtureRegion, FixtureOp>(fixtureRegions, initialSnapshot(), { keyframeInterval: 2 });
  tracer.enter(0);
  tracer.enter();
  tracer.step({ op: 'load', writes: [{ region: 'state', offset: 0, values: range(16, 0x10) }], highlights: [{ region: 'state', indices: range(16), kind: 'write' }], narration: { key: 'fixture.narration.load' } });
  tracer.leave();
  tracer.leave();
  tracer.enter(1);
  tracer.enter();
  tracer.step({ op: 'sub', writes: [{ region: 'state', offset: 0, values: [0xaa, 0xbb] }], highlights: [{ region: 'state', indices: [0, 1], kind: 'sbox' }], narration: { key: 'fixture.narration.sub', params: { count: 2 } } });
  tracer.leave();
  tracer.enter();
  tracer.step({ op: 'mix', writes: [{ region: 'w', offset: 16, values: [0xff] }], highlights: [{ region: 'w', indices: [16], kind: 'xor' }], narration: { key: 'fixture.narration.mix' } });
  tracer.leave();
  tracer.leave();
  const state = tracer.toFacet();
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'fixture', apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': state, 'narration@default': narrationFromState(state) },
    output: {},
  };
}

export const fixtureMessages: Messages = {
  'fixture.region.state': 'State',
  'fixture.region.w': 'Key schedule',
  'fixture.narration.load': 'Load the block',
  'fixture.narration.sub': 'Substitute {{count}} bytes',
  'fixture.narration.mix': 'Mix one word',
};
