import type { ChainFacet, Locale, Messages, TraceBundle } from '@cryventure/core';
import { fixtureCase, tickBundle } from '../testing/tickBundle.ts';
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
  const found = fixtureCase(fixture.cases, id);
  // JSON imports widen string unions (`kind`, `mode` …), hence the cast through `unknown`.
  return { stepCount: found.stepCount, chain: found.chain as unknown as ChainFacet };
}

/** A bundle with the case's chain facet plus an empty-write state facet so the playhead can move. */
export function gcmChainBundle(id: GcmChainCaseId): TraceBundle {
  const { stepCount, chain } = gcmChainCase(id);
  return tickBundle('gcm', stepCount, { 'chain@default': chain });
}

/** The gcm catalog entries the chain facets reference. */
export const gcmChainLabels: Record<Locale, Messages> = fixture.labels;
