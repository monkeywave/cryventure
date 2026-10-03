import {
  chainLabelRefs,
  getFacet,
  supportedLocales,
  wireLabelRefs,
  type ChainFacet,
  type I18nRef,
  type Locale,
  type Messages,
  type StateFacet,
  type WireFacet,
} from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { loadPluginCatalogs } from './catalogs.ts';
import { runOrThrow } from './primitiveContract.ts';
import { runOptionsFor } from './runWithPorts.ts';

/**
 * JSON snapshots of the `chain` / `wire` facets of real ecb, cbc and ctr runs for the mode-chain and
 * wire view tests (views may not import primitives). Kept fresh by `modeViewFixture.test.ts`.
 */
export type ModeFacetKind = 'chain' | 'wire';

export const MODE_VIEW_FIXTURES: Readonly<Record<ModeFacetKind, string>> = {
  chain: 'packages/views/src/mode-chain/fixtures/modes.json',
  wire: 'packages/views/src/wire/fixtures/modes.json',
};

/** The runs the fixtures snapshot: `<producer>/<preset>`. */
const CASES = [
  ['ecb', 'repeated-blocks'],
  ['ecb', 'repeated-blocks-decrypt'],
  ['cbc', 'repeated-blocks'],
  ['ctr', 'short-message'],
] as const;

export interface ModeViewCase<F> {
  producer: string;
  preset: string;
  stepCount: number;
  facet: F;
}

export interface ModeViewFixture<F> {
  cases: ModeViewCase<F>[];
  /** The plugin catalog entries the facets reference, per locale. */
  labels: Record<Locale, Messages>;
}

async function runCase(producer: string, presetId: string) {
  const manifest = primitiveManifests.find((candidate) => candidate.id === producer)!;
  const preset = manifest.presets.find((candidate) => candidate.id === presetId)!;
  const [module, options] = await Promise.all([manifest.load(), runOptionsFor(manifest, preset.params)]);
  return runOrThrow(module, preset.params, options);
}

function labelsFor(refs: readonly I18nRef[], producers: readonly string[]): Record<Locale, Messages> {
  const keys = new Set(refs.map((ref) => ref.key));
  const catalogs = producers.map((producer) => loadPluginCatalogs('primitives', producer));
  const labelsIn = (locale: Locale): Messages =>
    Object.fromEntries(
      catalogs
        .flatMap((catalog) => Object.entries(catalog[locale]))
        .filter(([key]) => keys.has(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  return Object.fromEntries(supportedLocales.map((locale) => [locale, labelsIn(locale)])) as Record<Locale, Messages>;
}

/** The fixture of `kind` as fresh runs of the cases produce it. */
export async function buildModeViewFixture(kind: 'chain'): Promise<ModeViewFixture<ChainFacet>>;
export async function buildModeViewFixture(kind: 'wire'): Promise<ModeViewFixture<WireFacet>>;
export async function buildModeViewFixture(kind: ModeFacetKind): Promise<ModeViewFixture<ChainFacet | WireFacet>> {
  const cases = await Promise.all(
    CASES.map(async ([producer, preset]) => {
      const bundle = await runCase(producer, preset);
      const state = getFacet<StateFacet<string, { op: string }>>(bundle, 'state')!;
      return { producer, preset, stepCount: state.steps.length, facet: getFacet<ChainFacet | WireFacet>(bundle, kind)! };
    }),
  );
  const refs = cases.flatMap(({ facet }) => (facet.kind === 'chain' ? chainLabelRefs(facet) : wireLabelRefs(facet)));
  return { cases, labels: labelsFor(refs, [...new Set(CASES.map(([producer]) => producer))]) };
}
