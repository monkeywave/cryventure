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
 * JSON snapshot of the `chain` and `wire` facets of real ecb, cbc and ctr runs for the mode-chain and
 * wire view tests (views may not import primitives). Kept fresh by `modeViewFixture.test.ts`.
 */
export const MODE_VIEW_FIXTURE = 'packages/views/src/testing/modes.json';

/** The runs the fixture snapshots: `<producer>/<preset>`. */
const CASES = [
  ['ecb', 'repeated-blocks'],
  ['ecb', 'repeated-blocks-decrypt'],
  ['cbc', 'repeated-blocks'],
  ['ctr', 'short-message'],
] as const;

export interface ModeViewCase {
  producer: string;
  preset: string;
  stepCount: number;
  chain: ChainFacet;
  wire: WireFacet;
}

export interface ModeViewFixture {
  cases: ModeViewCase[];
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

/** The fixture as fresh runs of the cases produce it. */
export async function buildModeViewFixture(): Promise<ModeViewFixture> {
  const cases = await Promise.all(
    CASES.map(async ([producer, preset]): Promise<ModeViewCase> => {
      const bundle = await runCase(producer, preset);
      const state = getFacet<StateFacet<string, { op: string }>>(bundle, 'state')!;
      const chain = getFacet<ChainFacet>(bundle, 'chain')!;
      const wire = getFacet<WireFacet>(bundle, 'wire')!;
      return { producer, preset, stepCount: state.steps.length, chain, wire };
    }),
  );
  const refs = cases.flatMap(({ chain, wire }) => [...chainLabelRefs(chain), ...wireLabelRefs(wire)]);
  return { cases, labels: labelsFor(refs, [...new Set(CASES.map(([producer]) => producer))]) };
}
