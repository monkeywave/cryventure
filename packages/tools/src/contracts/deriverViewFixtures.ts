import { getFacet, type Locale, type Messages, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { deriverManifests } from '@cryventure/derivers';
import { loadPluginCatalogs } from './catalogs.ts';
import { i18nRefsIn, stateStepCount, type DerivedFacets } from './deriverChecks.ts';
import { catalogLabels, runPreset } from './modeViewFixture.ts';

/**
 * JSON snapshots around the derivers (derivers may not import primitives, views may not import
 * derivers): the real AES, SHA-2 and SHA-3 bundles the deriver tests run on (`BUNDLE_FIXTURE_SETS`),
 * and the derived facets the instructions, registers and memory view tests render. Kept fresh by `snapshotFixtures.test.ts`;
 * `pnpm fixtures:update` rewrites them.
 */
export const INSTRUCTIONS_VIEW_FIXTURE = 'packages/views/src/instructions/fixtures/aesC1.json';
export const REGISTERS_VIEW_FIXTURE = 'packages/views/src/registers/fixtures/aesC1.json';
export const MEMORY_VIEW_FIXTURE = 'packages/views/src/memory/fixtures/aes128-memory.json';

const ISA_DERIVERS = ['isa-x86', 'isa-armv8'] as const;
const VIEW_PRESET = 'fips197-c1';
const ISA_COMMENT =
  'Test-only snapshot: the isa-x86 and isa-armv8 derivers run over the AES FIPS 197 C.1 bundle (packages/derivers/src/_lib/fixtures). Views may not import derivers, hence the JSON.';
const MEMORY_SOURCE = 'derivers/src/memory derive() over FIPS 197 C.1 (AES-128)';

/** The facets the derivers read (docs/M4.md §1b); every bundle snapshot keeps these. */
const DERIVER_INPUT_FACETS = ['state@default', 'values@default'];

/** One producer's bundle snapshots: a fresh run of each preset, reduced to the facets its derivers read. */
export interface BundleFixtureSet {
  producerId: string;
  presets: readonly string[];
  keptFacets: readonly string[];
  /** Repo-relative folder of the snapshots. */
  dir: string;
  /** Whether the file name starts with `<producerId>-` (`<producerId>-<preset>.bundle.json`, else `<preset>.bundle.json`). */
  producerPrefix: boolean;
}

const SHA_FIXTURE_DIR = 'packages/derivers/src/_lib/sha/fixtures';
/** The SHA derivers also read the word operations (docs/M6.md §5d for SHA-512). */
const SHA_DERIVER_INPUT_FACETS = [...DERIVER_INPUT_FACETS, 'wordops@default'];

export const BUNDLE_FIXTURE_SETS: readonly BundleFixtureSet[] = [
  { producerId: 'aes', presets: ['fips197-c1', 'fips197-c2', 'fips197-c3'], keptFacets: DERIVER_INPUT_FACETS, dir: 'packages/derivers/src/_lib/fixtures', producerPrefix: true },
  { producerId: 'sha256', presets: ['sha-256-abc', 'sha-256-two-block', 'sha-256-three-block', 'sha-224-abc'], keptFacets: SHA_DERIVER_INPUT_FACETS, dir: SHA_FIXTURE_DIR, producerPrefix: true },
  { producerId: 'sha512', presets: ['sha-512-abc', 'sha-512-two-block'], keptFacets: SHA_DERIVER_INPUT_FACETS, dir: SHA_FIXTURE_DIR, producerPrefix: true },
  // The Keccak ISA deriver: "abc", NIST Msg0, the two-block 1600-bit message, two squeezes; it also reads the sponge.
  { producerId: 'sha3', presets: ['sha3-256-abc', 'sha3-256-empty', 'sha3-256-1600', 'shake128-abc-336'], keptFacets: [...DERIVER_INPUT_FACETS, 'sponge@default'], dir: 'packages/derivers/src/_lib/keccak/fixtures', producerPrefix: false },
];

export const bundleFixturePath = (set: BundleFixtureSet, preset: string): string =>
  `${set.dir}/${set.producerPrefix ? `${set.producerId}-` : ''}${preset}.bundle.json`;

export interface BundleFixture {
  producerId: string;
  presetId: string;
  bundle: TraceBundle;
}

/** A fresh run of `preset` by the set's producer with only its kept facets. */
export async function buildBundleFixture(set: BundleFixtureSet, presetId: string): Promise<BundleFixture> {
  const bundle = await runPreset(set.producerId, presetId);
  const facets = Object.fromEntries(Object.entries(bundle.facets).filter(([key]) => set.keptFacets.includes(key)));
  return { producerId: set.producerId, presetId, bundle: { ...bundle, facets } };
}

async function derive(id: string, bundle: TraceBundle): Promise<DerivedFacets> {
  const manifest = deriverManifests.find((candidate) => candidate.id === id);
  if (manifest === undefined) throw new Error(`no deriver ${id}`);
  return (await manifest.load()).derive(bundle) as DerivedFacets;
}

const pickKind = (facets: DerivedFacets, kind: string): DerivedFacets =>
  Object.fromEntries(Object.entries(facets).filter(([key]) => key.startsWith(`${kind}@`)));

export interface IsaViewFixture {
  _comment: string;
  preset: typeof VIEW_PRESET;
  stepCount: number;
  facets: DerivedFacets;
  /** The deriver and AES catalog entries the facets (and the values facet) reference, per locale. */
  labels: Record<Locale, Messages>;
}

/**
 * The isa-x86 and isa-armv8 facets over a fresh AES C.1 run: `instructions` (with the values facet
 * the operands point into) or `registers`. Both snapshots carry the same labels: the derivers' refs
 * plus the AES value names.
 */
export async function buildIsaViewFixture(kind: 'instructions' | 'registers'): Promise<IsaViewFixture> {
  const bundle = await runPreset('aes', VIEW_PRESET);
  const derived = Object.assign({}, ...(await Promise.all(ISA_DERIVERS.map((id) => derive(id, bundle))))) as DerivedFacets;
  const values = getFacet<ValuesFacet>(bundle, 'values')!;
  const refs = [...i18nRefsIn(derived), ...values.values.map((value) => ({ key: value.labelKey }))];
  const catalogs = [...ISA_DERIVERS.map((id) => loadPluginCatalogs('derivers', id)), loadPluginCatalogs('primitives', 'aes')];
  const facets = kind === 'instructions' ? { 'values@default': values, ...pickKind(derived, kind) } : pickKind(derived, kind);
  return {
    _comment: ISA_COMMENT,
    preset: VIEW_PRESET,
    stepCount: stateStepCount(bundle),
    facets,
    labels: catalogLabels(refs, catalogs),
  };
}

export interface MemoryViewFixture {
  source: string;
  stepCount: number;
  facets: DerivedFacets;
}

/** The memory deriver's facets over a fresh AES C.1 run. */
export async function buildMemoryViewFixture(): Promise<MemoryViewFixture> {
  const bundle = await runPreset('aes', VIEW_PRESET);
  return { source: MEMORY_SOURCE, stepCount: stateStepCount(bundle), facets: await derive('memory', bundle) };
}
