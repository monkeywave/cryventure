import {
  facetKey,
  sboxEntry,
  type Messages,
  type TableFacet,
  type TraceBundle,
} from '@cryventure/core';
import { createFixtureBundle } from '@cryventure/viz/testing';

/**
 * Test-only: an S-box table facet built from core's `sboxEntry` (views may import core, not
 * primitives), shaped like the `aes-sbox` producer's.
 */
export function sboxTable(overrides: Partial<TableFacet> = {}): TableFacet {
  return {
    kind: 'table',
    schemaVersion: 1,
    title: { key: 'fixture.table.title' },
    rows: 16,
    cols: 16,
    entries: Array.from({ length: 256 }, (_, input) => sboxEntry(input)),
    ...overrides,
  };
}

/** The shared fixture bundle plus `table`. */
export function tableBundle(table: TableFacet): TraceBundle {
  const bundle = createFixtureBundle();
  return { ...bundle, facets: { ...bundle.facets, [facetKey('table')]: table } };
}

/** Producer labels the view renders (normally from the producer's catalog). */
export const tableLabels: Messages = {
  'fixture.table.title': 'S-box',
};
