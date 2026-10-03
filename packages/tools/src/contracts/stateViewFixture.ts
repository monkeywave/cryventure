import { getFacet, type Locale, type Messages, type StateFacet } from '@cryventure/core';
import { loadPluginCatalogs } from './catalogs.ts';
import { catalogLabels, runPreset } from './modeViewFixture.ts';

/**
 * JSON snapshot of the `state` facet of a real AES run (FIPS 197 C.1, op detail) for the state view
 * tests (views may not import primitives). Kept fresh by `snapshotFixtures.test.ts`.
 */
export const STATE_VIEW_FIXTURE = 'packages/views/src/state/fixtures/aes128-state.json';

const STATE_VIEW_PRESET = 'fips197-c1';

export interface StateViewFixture {
  preset: string;
  state: StateFacet<string, { op: string }>;
  /** The AES catalog entries of the region labels, per locale. */
  labels: Record<Locale, Messages>;
}

/** The fixture as a fresh AES C.1 run produces it. */
export async function buildStateViewFixture(): Promise<StateViewFixture> {
  const bundle = await runPreset('aes', STATE_VIEW_PRESET);
  const state = getFacet<StateFacet<string, { op: string }>>(bundle, 'state')!;
  const refs = state.regions.map((region) => ({ key: region.labelKey }));
  return { preset: STATE_VIEW_PRESET, state, labels: catalogLabels(refs, [loadPluginCatalogs('primitives', 'aes')]) };
}
