import type { Locale, Messages, TraceBundle, WireFacet } from '@cryventure/core';
import { fixtureCase, tickBundle } from '../testing/tickBundle.ts';
import fixture from './fixtures/gcm.json';

/**
 * Test-only: `wire` facets of real gcm runs (McGrew–Viega TC 4 encrypt, the forged-tag decrypt) plus
 * the gcm catalog entries they reference, generated from `@cryventure/primitives`; views may not
 * import primitives, hence the JSON snapshot.
 */
export type GcmWireCaseId = 'gcm/mcgrew-viega-tc4' | 'gcm/decrypt-forged';

export function gcmWireCase(id: GcmWireCaseId): { stepCount: number; wire: WireFacet } {
  const found = fixtureCase(fixture.cases, id);
  // JSON imports widen string unions (`role` …), hence the cast through `unknown`.
  return { stepCount: found.stepCount, wire: found.wire as unknown as WireFacet };
}

/** A bundle with the case's wire facet plus an empty-write state facet so the playhead can move. */
export function gcmWireBundle(id: GcmWireCaseId): TraceBundle {
  const { stepCount, wire } = gcmWireCase(id);
  return tickBundle('gcm', stepCount, { 'wire@default': wire });
}

/** The gcm catalog entries the wire facets reference. */
export const gcmWireLabels: Record<Locale, Messages> = fixture.labels;
