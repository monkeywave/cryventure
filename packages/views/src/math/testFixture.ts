import {
  facetKey,
  type AnyStateFacet,
  type MathFacet,
  type Messages,
  type TraceBundle,
} from '@cryventure/core';
import { createFixtureBundle } from '@cryventure/viz/testing';
import fixture from './fixtures/gmul-57-83.json';

/**
 * Test-only: the state and math facets of the gf256 module's FIPS 197 §4.2 run {57} • {83} = {c1}
 * (one math step per state step), plus the gf256 catalog entries they reference. Generated from
 * `@cryventure/primitives` and kept fresh by a tools contract test (`mathViewFixture.test.ts`);
 * views may not import primitives, hence the JSON snapshot.
 */
export const gmulMath = fixture.math as MathFacet;
// JSON imports widen string unions (`kind`, `elem` …), hence the cast through `unknown`.
const gmulState = fixture.state as unknown as AnyStateFacet;

/** The shared fixture bundle with the gf256 run's state facet and `math` (default: the run's). */
export function mathBundle(math: MathFacet = gmulMath): TraceBundle {
  const bundle = createFixtureBundle();
  return {
    ...bundle,
    producer: { kind: 'primitive', id: 'gf256', apiVersion: 1 },
    facets: { [facetKey('state')]: gmulState, [facetKey('math')]: math },
  };
}

/** Producer labels the view renders (the gf256 catalog entries the math facet references). */
export const mathLabels: Record<'en' | 'de', Messages> = fixture.labels;
