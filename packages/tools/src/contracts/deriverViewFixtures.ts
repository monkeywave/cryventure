import { getFacet, type Locale, type Messages, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { deriverManifests } from '@cryventure/derivers';
import { loadPluginCatalogs } from './catalogs.ts';
import { i18nRefsIn, stateStepCount, type DerivedFacets } from './deriverChecks.ts';
import { catalogLabels, runPreset } from './modeViewFixture.ts';

/**
 * JSON snapshots around the derivers (derivers may not import primitives, views may not import
 * derivers): the real AES bundles the deriver tests run on, and the derived facets the
 * instructions, registers and memory view tests render. Kept fresh by `snapshotFixtures.test.ts`;
 * `pnpm fixtures:update` rewrites them.
 */
export const AES_FIXTURE_PRESETS = ['fips197-c1', 'fips197-c2', 'fips197-c3'] as const;
export type AesFixturePreset = (typeof AES_FIXTURE_PRESETS)[number];

export const aesBundleFixturePath = (preset: AesFixturePreset): string =>
  `packages/derivers/src/_lib/fixtures/aes-${preset}.bundle.json`;
export const INSTRUCTIONS_VIEW_FIXTURE = 'packages/views/src/instructions/fixtures/aesC1.json';
export const REGISTERS_VIEW_FIXTURE = 'packages/views/src/registers/fixtures/aesC1.json';
export const MEMORY_VIEW_FIXTURE = 'packages/views/src/memory/fixtures/aes128-memory.json';

const ISA_DERIVERS = ['isa-x86', 'isa-armv8'] as const;
const VIEW_PRESET: AesFixturePreset = 'fips197-c1';
const ISA_COMMENT =
  'Test-only snapshot: the isa-x86 and isa-armv8 derivers run over the AES FIPS 197 C.1 bundle (packages/derivers/src/_lib/fixtures). Views may not import derivers, hence the JSON.';
const MEMORY_SOURCE = 'derivers/src/memory derive() over FIPS 197 C.1 (AES-128)';

export interface AesBundleFixture {
  producerId: 'aes';
  presetId: AesFixturePreset;
  bundle: TraceBundle;
}

/** The facets the derivers read (docs/M4.md §1b); the snapshots keep only these. */
const DERIVER_INPUT_FACETS = ['state@default', 'values@default'];

/** A fresh AES run of `preset` at op detail, reduced to the state and values facets. */
export async function buildAesBundleFixture(presetId: AesFixturePreset): Promise<AesBundleFixture> {
  const bundle = await runPreset('aes', presetId);
  const facets = Object.fromEntries(Object.entries(bundle.facets).filter(([key]) => DERIVER_INPUT_FACETS.includes(key)));
  return { producerId: 'aes', presetId, bundle: { ...bundle, facets } };
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
  preset: AesFixturePreset;
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
