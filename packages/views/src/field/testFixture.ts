import { RecordingTracer, type FieldFacet, type Locale, type Messages, type TraceBundle } from '@cryventure/core';
import fixture from './fixtures/field.json';

/**
 * Test-only: `field` facets of real runs (ghash McGrew–Viega TC 2 at block detail, ghash one block at
 * bit detail, gcm TC 4) plus the catalog entries they reference, generated from
 * `@cryventure/primitives`; views may not import primitives, hence the JSON snapshot.
 */
export type FieldCaseId = 'ghash/mcgrew-viega-tc2' | 'ghash/one-block-bits' | 'gcm/mcgrew-viega-tc4';

interface FieldCase {
  producer: string;
  stepCount: number;
  field: FieldFacet;
}

export function fieldCase(id: FieldCaseId): FieldCase {
  const found = fixture.cases.find((candidate) => `${candidate.producer}/${candidate.preset}` === id);
  if (found === undefined) throw new Error(`no field fixture ${id}`);
  // JSON imports widen string unions (`kind`, `role`, `op` …), hence the cast through `unknown`.
  return { producer: found.producer, stepCount: found.stepCount, field: found.field as unknown as FieldFacet };
}

/** A bundle with the case's field facet (or `field`) plus an empty-write state facet so the playhead can move. */
export function fieldBundle(id: FieldCaseId, field: FieldFacet = fieldCase(id).field): TraceBundle {
  const { producer, stepCount } = fieldCase(id);
  const tracer = new RecordingTracer<'s', { op: 'tick' }>([{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }], { s: [0] });
  for (let i = 0; i < stepCount; i++) tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: producer, apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'field@default': field },
    output: {},
  };
}

/** Producer labels the view renders (the ghash and gcm catalog entries the field facets reference). */
export const fieldLabels: Record<Locale, Messages> = fixture.labels;
