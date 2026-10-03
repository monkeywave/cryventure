import { RecordingTracer, type WireFacet, type Locale, type Messages, type TraceBundle } from '@cryventure/core';
import fixture from './fixtures/modes.json';

/**
 * Test-only: `wire` facets of real ecb, cbc and ctr runs plus the catalog entries they reference,
 * generated from `@cryventure/primitives` and kept fresh by a tools contract test
 * (`modeViewFixture.test.ts`); views may not import primitives, hence the JSON snapshot.
 */
export type WireCaseId = 'ecb/repeated-blocks' | 'ecb/repeated-blocks-decrypt' | 'cbc/repeated-blocks' | 'ctr/short-message';

interface WireCase {
  producer: string;
  stepCount: number;
  facet: WireFacet;
}

export function wireCase(id: WireCaseId): WireCase {
  const found = fixture.cases.find((candidate) => `${candidate.producer}/${candidate.preset}` === id);
  if (found === undefined) throw new Error(`no wire fixture ${id}`);
  // JSON imports widen string unions (`kind`, `role` …), hence the cast through `unknown`.
  return { producer: found.producer, stepCount: found.stepCount, facet: found.facet as unknown as WireFacet };
}

/** A bundle with the case's chain facet plus an empty-write state facet so the playhead can move. */
export function wireBundle(id: WireCaseId): TraceBundle {
  const { producer, stepCount, facet } = wireCase(id);
  const tracer = new RecordingTracer<'s', { op: 'tick' }>([{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }], { s: [0] });
  for (let i = 0; i < stepCount; i++) tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: producer, apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'wire@default': facet },
    output: {},
  };
}

/** Producer labels the view renders (the ecb/cbc/ctr catalog entries). */
export const wireLabels: Record<Locale, Messages> = fixture.labels;
