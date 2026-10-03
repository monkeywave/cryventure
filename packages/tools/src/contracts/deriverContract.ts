import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import type { DeriverManifest, DeriverModule } from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPluginCatalogs, type LocaleCatalogs } from './catalogs.ts';
import { keysOutsideNamespace, refProblems } from './checks.ts';
import { cachedPrimitiveBundleCases, type PrimitiveBundleCase } from './deriverCases.ts';
import {
  appliesToBundle,
  derivedAlignProblems,
  derivedKindProblems,
  derivedSchemaProblems,
  deriverManifestProblems,
  deriverNamespace,
  i18nRefsIn,
  malformedRefProblems,
  refsOutsideNamespace,
  stateStepCount,
  unknownValueRefProblems,
  type DerivedFacets,
} from './deriverChecks.ts';
import { goldenDir, goldenFileName, isGoldenUpdate, PREFERRED_GOLDEN_CASE, readGoldenFiles, writeGoldenFile, type GoldenFile } from './deriverGolden.ts';
import { jsonValueProblems } from './jsonValues.ts';
import type { ProducerSet } from './runWithPorts.ts';

export interface DeriverContractOptions {
  /** Producers whose `defaults` and presets the deriver runs on (e.g. `primitiveProducerSet`). */
  producers: ProducerSet;
  /** Deriver EN/DE catalogs; defaults to `packages/derivers/src/<id>/i18n/{en,de}.json`. */
  catalogs?: LocaleCatalogs;
  /** Folder of `*.golden.json` fixtures; defaults to `packages/derivers/src/<id>/fixtures`. */
  goldenDir?: string;
  /** Regenerate the golden files instead of comparing (default: `CV_GOLDEN_UPDATE=1`). */
  updateGolden?: boolean;
}

/** One applicable bundle and what `derive()` made of it (or why it failed). */
export interface DerivedCase {
  testCase: PrimitiveBundleCase;
  facets?: DerivedFacets;
  /** Why loading or deriving failed. */
  error?: string;
  /** A second `derive()` on a copy of the bundle gave different JSON. */
  nondeterministic?: boolean;
  /** `derive()` changed the bundle it was given. */
  mutatesInput?: boolean;
}

/** Problems per contract check (empty lists = pass); the suite registers one test per field. */
export interface DeriverReport {
  manifest: string[];
  applicable: string[];
  derives: string[];
  deterministic: string[];
  serializable: string[];
  kinds: string[];
  schema: string[];
  align: string[];
  valueRefs: string[];
  i18n: string[];
  namespace: string[];
  golden: string[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** JSON text of a value, or `undefined` when it cannot be serialized (bigint, cycles). */
function jsonText(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/** Derives one bundle twice (once from a copy) and checks determinism and that the input stays untouched. */
function deriveCase(module: DeriverModule, testCase: PrimitiveBundleCase): DerivedCase {
  const before = jsonText(testCase.bundle);
  try {
    const facets = module.derive(testCase.bundle) as DerivedFacets;
    const again = module.derive(structuredClone(testCase.bundle)) as DerivedFacets;
    return { testCase, facets, nondeterministic: jsonText(facets) !== jsonText(again), mutatesInput: jsonText(testCase.bundle) !== before };
  } catch (error) {
    return { testCase, error: `derive() threw: ${message(error)}` };
  }
}

/** Loads the module and derives every applicable case; a failing load is reported on every case. */
export async function deriveApplicableCases(manifest: DeriverManifest, cases: readonly PrimitiveBundleCase[]): Promise<DerivedCase[]> {
  const applicable = cases.filter((testCase) => appliesToBundle(manifest, testCase.bundle));
  try {
    const module = await manifest.load();
    return applicable.map((testCase) => deriveCase(module, testCase));
  } catch (error) {
    return applicable.map((testCase) => ({ testCase, error: `load() failed: ${message(error)}` }));
  }
}

type DerivedFacetsCase = DerivedCase & { facets: DerivedFacets };
type CaseCheck = (derived: DerivedFacetsCase) => string[];

/** `problems` of every case, each prefixed with the case name. */
function prefixed(cases: readonly DerivedCase[], problems: (derived: DerivedCase) => string[]): string[] {
  return cases.flatMap((derived) => problems(derived).map((problem) => `${derived.testCase.name}: ${problem}`));
}

/** Runs `check` on every case that derived facets, prefixing problems with the case name. */
function perCase(cases: readonly DerivedCase[], check: CaseCheck): string[] {
  return prefixed(cases, (derived) => (derived.facets === undefined ? [] : check(derived as DerivedFacetsCase)));
}

function deriveProblems({ error, mutatesInput }: DerivedCase): string[] {
  return [...(error === undefined ? [] : [error]), ...(mutatesInput === true ? ['derive() mutated the input bundle'] : [])];
}

function caseI18nProblems(facets: DerivedFacets, namespace: string, catalogs: LocaleCatalogs): string[] {
  const refs = i18nRefsIn(facets);
  return [...malformedRefProblems(facets), ...refsOutsideNamespace(refs, namespace), ...refProblems(refs, catalogs)];
}

function goldenFileProblems(file: GoldenFile, cases: readonly DerivedCase[], update: boolean): string[] {
  const { fixture } = file;
  if ('problem' in fixture) return [`${file.path}: ${fixture.problem}`];
  const derived = cases.find(({ testCase }) => testCase.producerId === fixture.producerId && testCase.presetId === fixture.presetId);
  if (derived?.facets === undefined) return [`${file.path}: no applicable, derivable case ${fixture.producerId}/${fixture.presetId}`];
  const actual = goldenFacets(derived.facets);
  if (update) {
    writeGoldenFile(file.path, { producerId: fixture.producerId, presetId: fixture.presetId, facets: actual });
    return [];
  }
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(fixture.facets)])];
  const differing = keys.filter((key) => !isDeepStrictEqual(actual[key], fixture.facets[key]));
  return differing.length === 0 ? [] : [`${file.path}: ${differing.join(', ')} differ from the golden fixture (pnpm golden:update regenerates it)`];
}

/** Plain JSON copy of derived facets (what a golden file stores). */
function goldenFacets(facets: DerivedFacets): DerivedFacets {
  return JSON.parse(jsonText(facets) ?? '{}') as DerivedFacets;
}

/** The case a first golden records: `PREFERRED_GOLDEN_CASE` when it derived, else the first case that did. */
function firstGoldenCase(cases: readonly DerivedCase[]): DerivedFacetsCase | undefined {
  const derivable = cases.filter((derived): derived is DerivedFacetsCase => derived.facets !== undefined);
  const preferred = derivable.find(({ testCase }) => testCase.producerId === PREFERRED_GOLDEN_CASE.producerId && testCase.presetId === PREFERRED_GOLDEN_CASE.presetId);
  return preferred ?? derivable[0];
}

/** Without any golden file: a problem, or in update mode the first golden fixture recorded. */
function missingGoldenProblems(dir: string, cases: readonly DerivedCase[], update: boolean): string[] {
  if (!update) return [`${dir}: no golden fixture (*.golden.json); pnpm golden:update records one`];
  const first = firstGoldenCase(cases);
  if (first === undefined) return [`${dir}: no golden fixture, and no applicable, derivable case to record one from`];
  const { producerId, presetId } = first.testCase;
  writeGoldenFile(join(dir, goldenFileName(producerId, presetId)), { producerId, presetId, facets: goldenFacets(first.facets) });
  return [];
}

/** Golden problems of a deriver's fixtures folder (docs/M4.md §7 requires at least one fixture). */
function goldenProblems(dir: string, cases: readonly DerivedCase[], update: boolean): string[] {
  const files = readGoldenFiles(dir);
  if (files.length === 0) return missingGoldenProblems(dir, cases, update);
  return files.flatMap((file) => goldenFileProblems(file, cases, update));
}

/** Every problem of a deriver against the real producers (docs/M4.md §7), grouped per contract check. */
export async function deriverReport(manifest: DeriverManifest, options: DeriverContractOptions & { catalogs: LocaleCatalogs }): Promise<DeriverReport> {
  const namespace = deriverNamespace(manifest.id);
  const cases = await deriveApplicableCases(manifest, await cachedPrimitiveBundleCases(options.producers));
  const update = options.updateGolden ?? isGoldenUpdate();
  return {
    manifest: deriverManifestProblems(manifest),
    applicable: cases.length > 0 ? [] : ['applies to no preset of any registered producer'],
    derives: prefixed(cases, deriveProblems),
    deterministic: prefixed(cases, (derived) => (derived.nondeterministic === true ? ['derive() is not deterministic'] : [])),
    serializable: perCase(cases, ({ facets }) => jsonValueProblems(facets)),
    kinds: perCase(cases, ({ facets }) => derivedKindProblems(manifest.provides, facets)),
    schema: perCase(cases, ({ facets }) => derivedSchemaProblems(facets)),
    align: perCase(cases, ({ facets, testCase }) => derivedAlignProblems(facets, stateStepCount(testCase.bundle))),
    valueRefs: perCase(cases, ({ facets, testCase }) => unknownValueRefProblems(facets, testCase.bundle)),
    i18n: perCase(cases, ({ facets }) => caseI18nProblems(facets, namespace, options.catalogs)),
    namespace: [...(Object.keys(options.catalogs.en).length === 0 ? ['the EN catalog is empty'] : []), ...keysOutsideNamespace(options.catalogs, namespace)],
    golden: goldenProblems(options.goldenDir ?? goldenDir(manifest.id), cases, update),
  };
}

/**
 * What `pnpm golden:update` does for one deriver: regenerates its golden files, recording the first
 * one when there is none. Returns the golden problems (empty = recorded). Used by tests that build a
 * deriver on the fly (the scaffold check) before they register the contract suite on it.
 */
export async function recordGoldenFixtures(manifest: DeriverManifest, options: DeriverContractOptions & { catalogs: LocaleCatalogs }): Promise<string[]> {
  return (await deriverReport(manifest, { ...options, updateGolden: true })).golden;
}

/** Test titles of the report's checks, in report order. */
export const DERIVER_CHECKS: readonly (readonly [keyof DeriverReport, string])[] = [
  ['manifest', 'has valid manifest basics and provides at least one facet kind'],
  ['applicable', 'applies to at least one real producer preset'],
  ['derives', 'loads and derives every applicable bundle without throwing or mutating it'],
  ['deterministic', 'derives deterministically'],
  ['serializable', 'derives JSON-serializable facets'],
  ['kinds', 'returns exactly its provided kinds, keyed kind@variant'],
  ['schema', 'derives facets that pass their core validators (and kit checks such as memory write lifetimes)'],
  ['align', 'aligns its steps within the bundle’s state steps (monotonic spans, none missing)'],
  ['valueRefs', 'refers only to values in the bundle’s values facet'],
  ['i18n', 'labels with deriver.<id>.* keys whose {{params}} exist in EN and DE'],
  ['namespace', 'keeps every catalog key under deriver.<id>.*'],
  ['golden', 'has golden fixtures (fixtures/*.golden.json) and matches them'],
];

/** A generous hook timeout: the report runs every preset of every producer once per test file. */
const REPORT_TIMEOUT_MS = 120_000;

/** Registers the generic contract suite for one deriver plugin (call at test-file top level). */
export function deriverContract(manifest: DeriverManifest, options: DeriverContractOptions): void {
  const catalogs = options.catalogs ?? loadPluginCatalogs('derivers', manifest.id);
  describe(`deriver "${manifest.id}" contract`, () => {
    let report: DeriverReport;
    beforeAll(async () => {
      report = await deriverReport(manifest, { ...options, catalogs });
    }, REPORT_TIMEOUT_MS);
    DERIVER_CHECKS.forEach(([check, title]) => it(title, () => expect(report[check]).toEqual([])));
  });
}
