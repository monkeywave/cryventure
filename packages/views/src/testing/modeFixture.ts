import { RecordingTracer, type ChainFacet, type Locale, type Messages, type TraceBundle, type WireFacet } from '@cryventure/core';
import fixture from './modes.json';

/**
 * Test-only: `chain` and `wire` facets of real ecb, cbc and ctr runs plus the catalog entries they
 * reference, generated from `@cryventure/primitives` and kept fresh by a tools contract test
 * (`modeViewFixture.test.ts`); views may not import primitives, hence the JSON snapshot.
 */
export type ModeCaseId = 'ecb/repeated-blocks' | 'ecb/repeated-blocks-decrypt' | 'cbc/repeated-blocks' | 'ctr/short-message';

interface ModeCase {
  producer: string;
  stepCount: number;
  chain: ChainFacet;
  wire: WireFacet;
}

export function modeCase(id: ModeCaseId): ModeCase {
  const found = fixture.cases.find((candidate) => `${candidate.producer}/${candidate.preset}` === id);
  if (found === undefined) throw new Error(`no mode fixture ${id}`);
  // JSON imports widen string unions (`kind`, `mode`, `role` …), hence the casts through `unknown`.
  return {
    producer: found.producer,
    stepCount: found.stepCount,
    chain: found.chain as unknown as ChainFacet,
    wire: found.wire as unknown as WireFacet,
  };
}

/** A bundle with the case's chain and wire facets plus an empty-write state facet so the playhead can move. */
export function modeBundle(id: ModeCaseId): TraceBundle {
  const { producer, stepCount, chain, wire } = modeCase(id);
  const tracer = new RecordingTracer<'s', { op: 'tick' }>([{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }], { s: [0] });
  for (let i = 0; i < stepCount; i++) tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: producer, apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'chain@default': chain, 'wire@default': wire },
    output: {},
  };
}

/** Producer labels the views render (the ecb/cbc/ctr catalog entries). */
export const modeLabels: Record<Locale, Messages> = fixture.labels;
