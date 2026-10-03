import type { ChainFacet, Locale, Messages, TraceBundle, WireFacet } from '@cryventure/core';
import { fixtureCase, tickBundle } from './tickBundle.ts';
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
  const found = fixtureCase(fixture.cases, id);
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
  return tickBundle(producer, stepCount, { 'chain@default': chain, 'wire@default': wire });
}

/** Producer labels the views render (the ecb/cbc/ctr catalog entries). */
export const modeLabels: Record<Locale, Messages> = fixture.labels;
