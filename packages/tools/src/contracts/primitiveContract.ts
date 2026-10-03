import {
  assertManifestBasics,
  getFacet,
  paramFieldKeys,
  paramFieldsOf,
  validateMathFacet,
  validateTableFacet,
  type DerivationFacet,
  type I18nRef,
  type MathFacet,
  type PrimitiveManifest,
  type PrimitiveModule,
  type RunOptions,
  type TableFacet,
  type TraceBundle,
} from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPluginCatalogs, type LocaleCatalogs } from './catalogs.ts';
import { conformanceFormatProblems, conformanceProblems, loadConformanceVectors, type ConformanceVectors } from './conformance.ts';
import { derivationProblems, stepChoreographyProblems } from './choreographyChecks.ts';
import {
  derivationGroupRefs,
  emittedNarration,
  initialNarrationProblems,
  jsonRoundTrip,
  keysOutsideNamespace,
  manifestLabelKeys,
  mathFacetRefs,
  mathStepRangeProblems,
  missingFacetKinds,
  missingKeys,
  normalFormProblems,
  refProblems,
  regionLayoutProblems,
  replayProblems,
  runtimeLabelKeys,
  tableFacetRefs,
  tableSelectParamProblems,
  unknownParamFields,
  type AnyStateFacet,
} from './checks.ts';
import { modeFacetIssues, modeFacetRefs } from './modeFacetChecks.ts';
import { implementedPortProblems, portFieldProblems, runInProblems, textFieldProblems } from './portChecks.ts';
import { runOptionsFor, type ProducerSet } from './runWithPorts.ts';

export interface PrimitiveContractOptions<P> {
  /** Plugin EN/DE catalogs; defaults to `packages/primitives/src/<id>/i18n/{en,de}.json`. */
  catalogs?: LocaleCatalogs;
  /** Parsed `vectors/conformance.json`; defaults to `packages/primitives/src/<id>/vectors/conformance.json`. */
  conformance?: unknown;
  /** Extra conformance check against the plugin's `vectors/`, given the lazily loaded module. */
  vectorsCheck?: (module: PrimitiveModule<P>) => void | Promise<void>;
  /** Registered producers for `port` params: field options and `resolve` (e.g. `primitiveProducerSet`). */
  producers: ProducerSet;
}

interface RunCase<P> {
  name: string;
  params: P;
}

/** `defaults` plus every preset, as named cases. */
export function runCases<P>(manifest: PrimitiveManifest<P>): RunCase<P>[] {
  return [{ name: 'defaults', params: manifest.defaults }, ...manifest.presets.map((preset) => ({ name: `preset ${preset.id}`, params: preset.params }))];
}

/** Runs `params` (with `options`), failing the test with the error key when the run is rejected. */
export function runOrThrow<P>(module: PrimitiveModule<P>, params: P, options?: RunOptions): TraceBundle {
  const result = module.run(params, options);
  if (!result.ok) throw new Error(`run() rejected params: ${JSON.stringify(result.error)}`);
  return result.trace;
}

function manifestSuite<P>(manifest: PrimitiveManifest<P>, catalogs: LocaleCatalogs, producers: ProducerSet): void {
  it('has valid manifest basics', () => {
    expect(() => assertManifestBasics(manifest)).not.toThrow();
    expect(manifest.kind).toBe('primitive');
    expect(manifest.i18nNamespace).toBe(`plugin.${manifest.id}`);
  });

  it('declares title and preset label keys present in EN and DE', () => {
    const keys = [manifest.titleKey, ...manifest.presets.map((preset) => preset.labelKey)];
    expect(missingKeys(keys, catalogs)).toEqual([]);
  });

  it('declares op and output label keys present in EN and DE', () => expect(missingKeys(manifestLabelKeys(manifest), catalogs)).toEqual([]));

  it('declares param fields for real params, with label/hint/option keys present in EN and DE', () => {
    const fields = paramFieldsOf(manifest);
    expect(unknownParamFields(fields, manifest.defaults)).toEqual([]);
    expect(missingKeys(paramFieldKeys(fields), catalogs)).toEqual([]);
  });

  it('keeps every catalog key under its i18n namespace', () => {
    expect(Object.keys(catalogs.en).length).toBeGreaterThan(0);
    expect(keysOutsideNamespace(catalogs, manifest.i18nNamespace)).toEqual([]);
  });

  it('accepts its defaults and presets in validate()', () => {
    runCases(manifest).forEach((testCase) => expect(manifest.validate(testCase.params).ok, testCase.name).toBe(true));
  });

  it('declares its defaults and presets in normal form (validate() returns them unchanged, key by key)', () => {
    expect(normalFormProblems(manifest, runCases(manifest))).toEqual([]);
  });

  it('declares port fields some producer implements, text fields whose values fit, and a valid runIn', () => {
    const fields = paramFieldsOf(manifest);
    expect([...portFieldProblems(fields, producers.list), ...textFieldProblems(fields, runCases(manifest)), ...runInProblems(manifest)]).toEqual([]);
  });

  if (manifest.implements.length > 0) {
    it('exposes every declared port, each passing its sanity check', async () => expect(implementedPortProblems(manifest, await manifest.load())).toEqual([]));
  }
}

function runSuite<P>(manifest: PrimitiveManifest<P>, catalogs: LocaleCatalogs, producers: ProducerSet, testCase: RunCase<P>): void {
  let module: PrimitiveModule<P>;
  let options: RunOptions;
  let bundle: TraceBundle;
  beforeAll(async () => {
    module = await manifest.load();
    options = await runOptionsFor(manifest, testCase.params, producers.lookup);
    bundle = runOrThrow(module, testCase.params, options);
  });

  it('is deterministic', () => expect(runOrThrow(module, testCase.params, options)).toEqual(bundle));
  it('emits every declared facet', () => expect(missingFacetKinds(manifest.facets, bundle)).toEqual([]));
  it('labels regions, scope levels and values with keys present in EN and DE', () => expect(missingKeys(runtimeLabelKeys(bundle), catalogs)).toEqual([]));
  it('declares region layouts whose words fit their regions', () => {
    expect(regionLayoutProblems(getFacet<AnyStateFacet>(bundle, 'state')?.regions ?? [])).toEqual([]);
  });
  it('narrates (initial narration included) with keys and {{params}} present in EN and DE', () => expect(refProblems(emittedNarration(bundle), catalogs)).toEqual([]));
  it('narrates the initial state (step −1) exactly as the state facet declares it', () => expect(initialNarrationProblems(bundle)).toEqual([]));
  it('replays consistently (keyframes and stateAt)', () => {
    const state = getFacet<AnyStateFacet>(bundle, 'state');
    expect(state === undefined ? [] : replayProblems(state)).toEqual([]);
  });
  it('is JSON-serializable', () => expect(jsonRoundTrip(bundle)).toEqual(bundle));
  it('emits valid chain/wire facets (if any) labelled with keys and {{params}} present in EN and DE', () => {
    expect([...modeFacetIssues(bundle), ...refProblems(modeFacetRefs(bundle), catalogs)]).toEqual([]);
  });
  optionalRunChecks(manifest, catalogs, () => bundle);
}

/** Checks that only apply when the manifest opts in (choreography, derivation/math/table facets). */
function optionalRunChecks<P>(manifest: PrimitiveManifest<P>, catalogs: LocaleCatalogs, bundle: () => TraceBundle): void {
  const { loadChoreography } = manifest;
  if (loadChoreography !== undefined) {
    it('choreographs every step with valid targets, sorted keyframes, neutral end props and EN/DE beats', async () => {
      const state = getFacet<AnyStateFacet>(bundle(), 'state');
      const module = await loadChoreography();
      expect(state === undefined ? ['no state facet to choreograph'] : stepChoreographyProblems(module, state, catalogs)).toEqual([]);
    });
  }
  if (manifest.facets.includes('derivation')) derivationChecks(catalogs, bundle);
  if (manifest.facets.includes('math')) {
    facetChecks<MathFacet>('math', validateMathFacet, mathFacetRefs, catalogs, bundle);
    mathCrossChecks(bundle);
  }
  if (manifest.facets.includes('table')) {
    facetChecks<TableFacet>('table', validateTableFacet, tableFacetRefs, catalogs, bundle);
    tableCrossChecks(manifest, bundle);
  }
}

function mathCrossChecks(bundle: () => TraceBundle): void {
  it('aligns every math step with a state step or the narrated initial state (step −1)', () => {
    const math = getFacet<MathFacet>(bundle(), 'math');
    const state = getFacet<AnyStateFacet>(bundle(), 'state') ?? { steps: [] };
    expect(math === undefined ? [] : mathStepRangeProblems(math, state)).toEqual([]);
  });
}

function tableCrossChecks<P>(manifest: PrimitiveManifest<P>, bundle: () => TraceBundle): void {
  it('selects through a real param whose hex index round-trips through validate', () => {
    const table = getFacet<TableFacet>(bundle(), 'table');
    expect(table === undefined ? [] : tableSelectParamProblems(table, manifest, bundle().params as P)).toEqual([]);
  });
}

function derivationChecks(catalogs: LocaleCatalogs, bundle: () => TraceBundle): void {
  it('orders its derivation facet topologically', () => {
    const derivation = getFacet<DerivationFacet>(bundle(), 'derivation');
    expect(derivation === undefined ? ['no derivation facet'] : derivationProblems(derivation)).toEqual([]);
  });
  it('labels its derivation groups with keys and {{params}} present in EN and DE', () => {
    const derivation = getFacet<DerivationFacet>(bundle(), 'derivation');
    expect(refProblems(derivation === undefined ? [] : derivationGroupRefs(derivation), catalogs)).toEqual([]);
  });
}

/** Schema validation plus EN/DE key and `{{params}}` checks for one declared facet kind. */
function facetChecks<F>(kind: string, validate: (facet: F) => string[], refs: (facet: F) => I18nRef[], catalogs: LocaleCatalogs, bundle: () => TraceBundle): void {
  it(`emits a valid ${kind} facet`, () => {
    const facet = getFacet<F>(bundle(), kind);
    expect(facet === undefined ? [`no ${kind} facet`] : validate(facet)).toEqual([]);
  });
  it(`labels its ${kind} facet with keys and {{params}} present in EN and DE`, () => {
    const facet = getFacet<F>(bundle(), kind);
    expect(refProblems(facet === undefined ? [] : refs(facet), catalogs)).toEqual([]);
  });
}

/** Checks the generic conformance file: at least one well-formed case, each reproduced by `run()`. */
function conformanceSuite<P>(manifest: PrimitiveManifest<P>, vectors: unknown, producers: ProducerSet): void {
  it('ships well-formed conformance vectors (vectors/conformance.json, ≥1 case)', () => expect(conformanceFormatProblems(vectors)).toEqual([]));
  it('reproduces every conformance vector', async () => {
    if (conformanceFormatProblems(vectors).length > 0) throw new Error('vectors/conformance.json is missing or malformed (see the previous test)');
    const prepare = (params: unknown) => runOptionsFor(manifest, params, producers.lookup);
    expect(await conformanceProblems(await manifest.load(), vectors as ConformanceVectors, prepare)).toEqual([]);
  });
}

/** Registers the generic contract suite for one primitive plugin (call at test-file top level). */
export function primitiveContract<P>(manifest: PrimitiveManifest<P>, options: PrimitiveContractOptions<P>): void {
  const catalogs = options.catalogs ?? loadPluginCatalogs('primitives', manifest.id);
  const { producers } = options;
  describe(`primitive "${manifest.id}" contract`, () => {
    manifestSuite(manifest, catalogs, producers);
    describe.each(runCases(manifest))('run($name)', (testCase) => runSuite(manifest, catalogs, producers, testCase));
    conformanceSuite(manifest, 'conformance' in options ? options.conformance : loadConformanceVectors('primitives', manifest.id), producers);
    const { vectorsCheck } = options;
    if (vectorsCheck !== undefined) it('conforms to its vectors', async () => vectorsCheck(await manifest.load()));
  });
}
