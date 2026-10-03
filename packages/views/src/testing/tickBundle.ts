import { RecordingTracer, type TraceBundle } from '@cryventure/core';

/**
 * Test-only: a bundle of `facets` plus an empty-write `state@default` facet of `stepCount` ticks, so
 * the playhead can move over facets that came from a JSON snapshot (views may not import producers).
 */
export function tickBundle(producer: string, stepCount: number, facets: Record<string, unknown>): TraceBundle {
  const tracer = new RecordingTracer<'s', { op: 'tick' }>([{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }], { s: [0] });
  for (let i = 0; i < stepCount; i++) tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: producer, apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), ...facets },
    output: {},
  };
}

/** One case of a JSON snapshot, by its `producer/preset` id; throws for an unknown id (a broken test). */
export function fixtureCase<C extends { producer: string; preset: string }>(cases: readonly C[], id: string): C {
  const found = cases.find((candidate) => `${candidate.producer}/${candidate.preset}` === id);
  if (found === undefined) throw new Error(`no fixture case ${id}`);
  return found;
}
