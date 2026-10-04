import {
  chainLabelRefs,
  getFacet,
  wireLabelRefs,
  type AnyStateFacet,
  type ChainFacet,
  type FieldFacet,
  type I18nRef,
  type Locale,
  type Messages,
  type TraceBundle,
  type WireFacet,
} from '@cryventure/core';
import { termFacetRefs } from './checks.ts';
import { labelsFor, runPreset } from './modeViewFixture.ts';

/**
 * JSON snapshots of the `field`, `chain` and `wire` facets of real ghash/gcm runs for the field,
 * mode-chain and wire view tests (views may not import primitives). Kept fresh by
 * `snapshotFixtures.test.ts`; `pnpm fixtures:update` rewrites them.
 */
export const FIELD_VIEW_FIXTURE = 'packages/views/src/field/fixtures/field.json';
export const GCM_CHAIN_VIEW_FIXTURE = 'packages/views/src/mode-chain/fixtures/gcm.json';
export const GCM_WIRE_VIEW_FIXTURE = 'packages/views/src/wire/fixtures/gcm.json';

type Run = readonly [producer: string, preset: string];

const FIELD_RUNS: readonly Run[] = [
  ['ghash', 'mcgrew-viega-tc2'],
  ['ghash', 'one-block-bits'],
  ['gcm', 'mcgrew-viega-tc4'],
];
const GCM_RUNS: readonly Run[] = [
  ['gcm', 'mcgrew-viega-tc4'],
  ['gcm', 'decrypt-forged'],
];

export interface FacetViewFixture<K extends string, F> {
  cases: ({ producer: string; preset: string; stepCount: number } & Record<K, F>)[];
  /** The producers' catalog entries the facets reference, per locale. */
  labels: Record<Locale, Messages>;
}

/** Runs each of `runs` fresh and snapshots one facet (`kind`) of each, plus the labels it references. */
async function buildFacetViewFixture<K extends string, F>(
  runs: readonly Run[],
  kind: K,
  refsOf: (facet: F) => I18nRef[],
): Promise<FacetViewFixture<K, F>> {
  const cases = await Promise.all(
    runs.map(async ([producer, preset]) => {
      const bundle: TraceBundle = await runPreset(producer, preset);
      const stepCount = getFacet<AnyStateFacet>(bundle, 'state')!.steps.length;
      return { producer, preset, stepCount, [kind]: getFacet<F>(bundle, kind)! } as FacetViewFixture<K, F>['cases'][number];
    }),
  );
  const refs = cases.flatMap((testCase) => refsOf(testCase[kind] as F));
  return { cases, labels: labelsFor(refs, [...new Set(runs.map(([producer]) => producer))]) };
}

/** `field` facets of ghash TC 2 (block detail), ghash one block (bit detail) and gcm TC 4. */
export function buildFieldViewFixture(): Promise<FacetViewFixture<'field', FieldFacet>> {
  return buildFacetViewFixture<'field', FieldFacet>(FIELD_RUNS, 'field', termFacetRefs);
}

/** `chain` facets of gcm TC 4 (encrypt) and the forged-tag decrypt. */
export function buildGcmChainViewFixture(): Promise<FacetViewFixture<'chain', ChainFacet>> {
  return buildFacetViewFixture(GCM_RUNS, 'chain', chainLabelRefs);
}

/** `wire` facets of gcm TC 4 (encrypt) and the forged-tag decrypt. */
export function buildGcmWireViewFixture(): Promise<FacetViewFixture<'wire', WireFacet>> {
  return buildFacetViewFixture(GCM_RUNS, 'wire', wireLabelRefs);
}
