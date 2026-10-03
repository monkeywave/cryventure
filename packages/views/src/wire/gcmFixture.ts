import { RecordingTracer, type Locale, type Messages, type TraceBundle, type WireFacet } from '@cryventure/core';
import fixture from './fixtures/gcm.json';

/**
 * Test-only: `wire` facets of real gcm runs (McGrew–Viega TC 4 encrypt, the forged-tag decrypt) plus
 * the gcm catalog entries they reference, generated from `@cryventure/primitives`; views may not
 * import primitives, hence the JSON snapshot.
 */
export type GcmWireCaseId = 'gcm/mcgrew-viega-tc4' | 'gcm/decrypt-forged';

export function gcmWireCase(id: GcmWireCaseId): { stepCount: number; wire: WireFacet } {
  const found = fixture.cases.find((candidate) => `${candidate.producer}/${candidate.preset}` === id);
  if (found === undefined) throw new Error(`no gcm wire fixture ${id}`);
  // JSON imports widen string unions (`role` …), hence the cast through `unknown`.
  return { stepCount: found.stepCount, wire: found.wire as unknown as WireFacet };
}

/** A bundle with the case's wire facet plus an empty-write state facet so the playhead can move. */
export function gcmWireBundle(id: GcmWireCaseId): TraceBundle {
  const { stepCount, wire } = gcmWireCase(id);
  const tracer = new RecordingTracer<'s', { op: 'tick' }>([{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }], { s: [0] });
  for (let i = 0; i < stepCount; i++) tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'gcm', apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'wire@default': wire },
    output: {},
  };
}

/** The gcm catalog entries the wire facets reference. */
export const gcmWireLabels: Record<Locale, Messages> = fixture.labels;
