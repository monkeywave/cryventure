import { assertManifestBasics, getFacet, paramFieldKeys, paramFieldsOf, type DerivationFacet, type PrimitiveManifest, type PrimitiveModule, type TraceBundle } from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPluginCatalogs, type LocaleCatalogs } from './catalogs.ts';
import { derivationProblems, stepChoreographyProblems } from './choreographyChecks.ts';
import { emittedNarration, jsonRoundTrip, keysOutsideNamespace, missingFacetKinds, missingKeys, refProblems, replayProblems, runtimeLabelKeys, unknownParamFields, type AnyStateFacet } from './checks.ts';

export interface PrimitiveContractOptions<P> {
  /** Plugin EN/DE catalogs; defaults to `packages/primitives/src/<id>/i18n/{en,de}.json`. */
  catalogs?: LocaleCatalogs;
  /** Extra conformance check against the plugin's `vectors/`, given the lazily loaded module. */
  vectorsCheck?: (module: PrimitiveModule<P>) => void | Promise<void>;
}

interface RunCase<P> {
  name: string;
  params: P;
}

/** `defaults` plus every preset, as named cases. */
export function runCases<P>(manifest: PrimitiveManifest<P>): RunCase<P>[] {
  return [{ name: 'defaults', params: manifest.defaults }, ...manifest.presets.map((preset) => ({ name: `preset ${preset.id}`, params: preset.params }))];
}

/** Runs `params`, failing the test with the error key when the run is rejected. */
export function runOrThrow<P>(module: PrimitiveModule<P>, params: P): TraceBundle {
  const result = module.run(params);
  if (!result.ok) throw new Error(`run() rejected params: ${JSON.stringify(result.error)}`);
  return result.trace;
}

function manifestSuite<P>(manifest: PrimitiveManifest<P>, catalogs: LocaleCatalogs): void {
  it('has valid manifest basics', () => {
    expect(() => assertManifestBasics(manifest)).not.toThrow();
    expect(manifest.kind).toBe('primitive');
    expect(manifest.i18nNamespace).toBe(`plugin.${manifest.id}`);
  });

  it('declares title and preset label keys present in EN and DE', () => {
    const keys = [manifest.titleKey, ...manifest.presets.map((preset) => preset.labelKey)];
    expect(missingKeys(keys, catalogs)).toEqual([]);
  });

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
}

function runSuite<P>(manifest: PrimitiveManifest<P>, catalogs: LocaleCatalogs, testCase: RunCase<P>): void {
  let module: PrimitiveModule<P>;
  let bundle: TraceBundle;
  beforeAll(async () => {
    module = await manifest.load();
    bundle = runOrThrow(module, testCase.params);
  });

  it('is deterministic', () => expect(runOrThrow(module, testCase.params)).toEqual(bundle));
  it('emits every declared facet', () => expect(missingFacetKinds(manifest.facets, bundle)).toEqual([]));
  it('labels regions and values with keys present in EN and DE', () => expect(missingKeys(runtimeLabelKeys(bundle), catalogs)).toEqual([]));
  it('narrates with keys and {{params}} present in EN and DE', () => expect(refProblems(emittedNarration(bundle), catalogs)).toEqual([]));
  it('replays consistently (keyframes and stateAt)', () => {
    const state = getFacet<AnyStateFacet>(bundle, 'state');
    expect(state === undefined ? [] : replayProblems(state)).toEqual([]);
  });
  it('is JSON-serializable', () => expect(jsonRoundTrip(bundle)).toEqual(bundle));
  optionalRunChecks(manifest, catalogs, () => bundle);
}

/** Checks that only apply when the manifest opts in (choreography, derivation facet). */
function optionalRunChecks<P>(manifest: PrimitiveManifest<P>, catalogs: LocaleCatalogs, bundle: () => TraceBundle): void {
  const { loadChoreography } = manifest;
  if (loadChoreography !== undefined) {
    it('choreographs every step with valid targets, sorted keyframes, neutral end props and EN/DE beats', async () => {
      const state = getFacet<AnyStateFacet>(bundle(), 'state');
      const module = await loadChoreography();
      expect(state === undefined ? ['no state facet to choreograph'] : stepChoreographyProblems(module, state, catalogs)).toEqual([]);
    });
  }
  if (manifest.facets.includes('derivation')) {
    it('orders its derivation facet topologically', () => {
      const derivation = getFacet<DerivationFacet>(bundle(), 'derivation');
      expect(derivation === undefined ? ['no derivation facet'] : derivationProblems(derivation)).toEqual([]);
    });
  }
}

/** Registers the generic contract suite for one primitive plugin (call at test-file top level). */
export function primitiveContract<P>(manifest: PrimitiveManifest<P>, options: PrimitiveContractOptions<P> = {}): void {
  const catalogs = options.catalogs ?? loadPluginCatalogs('primitives', manifest.id);
  describe(`primitive "${manifest.id}" contract`, () => {
    manifestSuite(manifest, catalogs);
    describe.each(runCases(manifest))('run($name)', (testCase) => runSuite(manifest, catalogs, testCase));
    const { vectorsCheck } = options;
    if (vectorsCheck !== undefined) it('conforms to its vectors', async () => vectorsCheck(await manifest.load()));
  });
}
