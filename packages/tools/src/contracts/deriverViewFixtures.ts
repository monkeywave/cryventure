import { getFacet, type Locale, type Messages, type TraceBundle, type ValuesFacet } from '@cryventure/core';
import { deriverManifests } from '@cryventure/derivers';
import { loadPluginCatalogs } from './catalogs.ts';
import { i18nRefsIn, stateStepCount, type DerivedFacets } from './deriverChecks.ts';
import { catalogLabels, runPreset } from './modeViewFixture.ts';

/**
 * JSON snapshots around the derivers (derivers may not import primitives, views may not import
 * derivers): the real AES, SHA-256 and SHA-512 bundles the deriver tests run on, and the derived facets the
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
  return { producerId: 'aes', presetId, bundle: await runPresetKeepingFacets('aes', presetId, DERIVER_INPUT_FACETS) };
}

export const SHA_FIXTURE_PRESETS = ['sha-256-abc', 'sha-256-two-block', 'sha-256-three-block', 'sha-224-abc', 'sha-512-abc', 'sha-512-two-block'] as const;
export type ShaFixturePreset = (typeof SHA_FIXTURE_PRESETS)[number];

/** The producer of a SHA fixture preset: `sha512` for the SHA-512 presets (docs/M6.md §5d), else `sha256`. */
export const shaFixtureProducer = (preset: ShaFixturePreset): 'sha256' | 'sha512' => (preset.startsWith('sha-512') ? 'sha512' : 'sha256');

export const shaBundleFixturePath = (preset: ShaFixturePreset): string =>
  `packages/derivers/src/_lib/sha/fixtures/${shaFixtureProducer(preset)}-${preset}.bundle.json`;

export interface ShaBundleFixture {
  producerId: 'sha256' | 'sha512';
  presetId: ShaFixturePreset;
  bundle: TraceBundle;
}

/** The facets the SHA derivers read: the AES ones plus the word operations. */
const SHA_DERIVER_INPUT_FACETS = [...DERIVER_INPUT_FACETS, 'wordops@default'];

/** A fresh `sha256` or `sha512` run of `preset`, reduced to the state, values and wordops facets. */
export async function buildShaBundleFixture(presetId: ShaFixturePreset): Promise<ShaBundleFixture> {
  const producerId = shaFixtureProducer(presetId);
  return { producerId, presetId, bundle: await runPresetKeepingFacets(producerId, presetId, SHA_DERIVER_INPUT_FACETS) };
}

/** `sha3` presets the Keccak ISA deriver tests run on: "abc", NIST Msg0, the two-block 1600-bit message, two squeezes. */
export const SHA3_FIXTURE_PRESETS = ['sha3-256-abc', 'sha3-256-empty', 'sha3-256-1600', 'shake128-abc-336'] as const;
export type Sha3FixturePreset = (typeof SHA3_FIXTURE_PRESETS)[number];

export const sha3BundleFixturePath = (preset: Sha3FixturePreset): string =>
  `packages/derivers/src/_lib/keccak/fixtures/${preset}.bundle.json`;

export interface Sha3BundleFixture {
  producerId: 'sha3';
  presetId: Sha3FixturePreset;
  bundle: TraceBundle;
}

/** The facets the Keccak deriver reads: the AES ones plus the sponge. */
const SHA3_DERIVER_INPUT_FACETS = [...DERIVER_INPUT_FACETS, 'sponge@default'];

/** A fresh `sha3` run of `preset` (mapping detail), reduced to the state, values and sponge facets. */
export async function buildSha3BundleFixture(presetId: Sha3FixturePreset): Promise<Sha3BundleFixture> {
  return { producerId: 'sha3', presetId, bundle: await runPresetKeepingFacets('sha3', presetId, SHA3_DERIVER_INPUT_FACETS) };
}

/** A fresh run of the producer's preset with only the `kept` facets. */
async function runPresetKeepingFacets(producer: string, presetId: string, kept: readonly string[]): Promise<TraceBundle> {
  const bundle = await runPreset(producer, presetId);
  const facets = Object.fromEntries(Object.entries(bundle.facets).filter(([key]) => kept.includes(key)));
  return { ...bundle, facets };
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
