import { RecordingTracer, type ChainFacet, type Locale, type Messages, type TraceBundle } from '@cryventure/core';
import fixture from './fixtures/gcm.json';

/**
 * Test-only: `chain` facets of real gcm runs (McGrew–Viega TC 4 encrypt, the forged-tag decrypt)
 * plus the gcm catalog entries they reference, generated from `@cryventure/primitives`; views may not
 * import primitives, hence the JSON snapshot.
 */
export type GcmChainCaseId = 'gcm/mcgrew-viega-tc4' | 'gcm/decrypt-forged';

interface GcmChainCase {
  stepCount: number;
  chain: ChainFacet;
}

export function gcmChainCase(id: GcmChainCaseId): GcmChainCase {
  const found = fixture.cases.find((candidate) => `${candidate.producer}/${candidate.preset}` === id);
  if (found === undefined) throw new Error(`no gcm chain fixture ${id}`);
  // JSON imports widen string unions (`kind`, `mode` …), hence the cast through `unknown`.
  return { stepCount: found.stepCount, chain: found.chain as unknown as ChainFacet };
}

/** A bundle with the case's chain facet plus an empty-write state facet so the playhead can move. */
export function gcmChainBundle(id: GcmChainCaseId): TraceBundle {
  const { stepCount, chain } = gcmChainCase(id);
  const tracer = new RecordingTracer<'s', { op: 'tick' }>([{ id: 's', labelKey: 'fixture.region.s', elem: 'u8', shape: [1] }], { s: [0] });
  for (let i = 0; i < stepCount; i++) tracer.step({ op: 'tick', writes: [], highlights: [], narration: { key: 'fixture.tick' } });
  return {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: 'gcm', apiVersion: 1 },
    provenance: 'modeled',
    params: {},
    facets: { 'state@default': tracer.toFacet(), 'chain@default': chain },
    output: {},
  };
}

/** The gcm catalog entries the chain facets reference. */
export const gcmChainLabels: Record<Locale, Messages> = fixture.labels;
