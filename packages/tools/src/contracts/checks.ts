import {
  applyWrites,
  byteToHex,
  elemBytes,
  extractParams,
  getFacet,
  resolveMessageKey,
  regionSize,
  stateAt,
  type AnyStateFacet,
  type DerivationFacet,
  type FacetKind,
  type I18nRef,
  type MathFacet,
  type NarrationFacet,
  type ParamField,
  type PrimitiveManifest,
  type RegionSpec,
  type Snapshot,
  type TableFacet,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { CONTRACT_LOCALES, type LocaleCatalogs } from './catalogs.ts';

/** Pure contract checks; each returns a list of human-readable problems (empty = pass). */
export type { AnyStateFacet } from '@cryventure/core';

/** `locale:key` for every key absent from a locale catalog. */
export function missingKeys(keys: readonly string[], catalogs: LocaleCatalogs): string[] {
  return CONTRACT_LOCALES.flatMap((locale) => keys.filter((key) => !Object.hasOwn(catalogs[locale], key)).map((key) => `${locale}:${key}`));
}

/** Catalog keys that live outside the plugin's namespace (`<namespace>.`). */
export function keysOutsideNamespace(catalogs: LocaleCatalogs, namespace: string): string[] {
  return CONTRACT_LOCALES.flatMap((locale) => Object.keys(catalogs[locale]).filter((key) => !key.startsWith(`${namespace}.`)).map((key) => `${locale}:${key}`));
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join() === [...b].sort().join();
}

/** Refs whose key is missing or whose params differ from the template's `{{params}}`. */
export function refProblems(refs: readonly I18nRef[], catalogs: LocaleCatalogs): string[] {
  return CONTRACT_LOCALES.flatMap((locale) =>
    refs.flatMap((ref) => {
      const key = resolveMessageKey(catalogs[locale], ref.key, ref.params, locale);
      const template = key === undefined ? undefined : catalogs[locale][key];
      if (template === undefined) return [`${locale}:${ref.key} missing`];
      const given = Object.keys(ref.params ?? {});
      return sameNames(given, extractParams(template)) ? [] : [`${locale}:${ref.key} params [${given.join()}] vs template [${extractParams(template).join()}]`];
    }),
  );
}

function uniqueRefs(refs: readonly I18nRef[]): I18nRef[] {
  return [...new Map(refs.map((ref) => [JSON.stringify(ref), ref])).values()];
}

/** Every narration ref a bundle emits: narration facet entries plus per-step state narration. */
export function emittedNarration(bundle: TraceBundle): I18nRef[] {
  const narration = getFacet<NarrationFacet>(bundle, 'narration')?.entries.map((entry) => entry.ref) ?? [];
  const steps = getFacet<AnyStateFacet>(bundle, 'state')?.steps.map((step) => step.narration) ?? [];
  return uniqueRefs([...narration, ...steps]);
}

/** Label keys of a state facet's scope levels: each level's template plus its optional next/prev labels. */
export function scopeLevelKeys(facet: Pick<AnyStateFacet, 'scopeLevels'>): string[] {
  return (facet.scopeLevels ?? []).flatMap((level) => [level.labelKey, level.nextKey, level.prevKey].filter((key) => key !== undefined));
}

/** Label keys a run declares at runtime: state region and scope-level labels and ValueRef labels. */
export function runtimeLabelKeys(bundle: TraceBundle): string[] {
  const state = getFacet<AnyStateFacet>(bundle, 'state');
  const regions = state?.regions.map((region) => region.labelKey) ?? [];
  const scopes = state === undefined ? [] : scopeLevelKeys(state);
  const values = getFacet<ValuesFacet>(bundle, 'values')?.values.map((value) => value.labelKey) ?? [];
  return [...new Set([...regions, ...scopes, ...values])];
}

/** Op label keys (`ops[op].labelKey`/`shortLabelKey`) and output label keys a primitive manifest declares. */
export function manifestLabelKeys(manifest: Pick<PrimitiveManifest, 'ops' | 'outputs'>): string[] {
  const ops = Object.values(manifest.ops ?? {}).flatMap((labels) => [labels.labelKey, labels.shortLabelKey].filter((key) => key !== undefined));
  const outputs = Object.values(manifest.outputs ?? {}).map((label) => label.labelKey);
  return [...new Set([...ops, ...outputs])];
}

/** `words` layouts whose `wordBytes` is not a positive integer dividing the region's byte size. */
export function regionLayoutProblems(regions: readonly RegionSpec<string>[]): string[] {
  return regions.flatMap((region) => {
    if (region.layout?.kind !== 'words') return [];
    const { wordBytes } = region.layout;
    const bytes = regionSize(region) * elemBytes(region.elem);
    const divides = Number.isInteger(wordBytes) && wordBytes > 0 && bytes % wordBytes === 0;
    return divides ? [] : [`region "${region.id}": wordBytes ${wordBytes} does not divide its ${bytes} bytes`];
  });
}

/** The label refs of a derivation facet's declared groups. */
export function derivationGroupRefs(facet: DerivationFacet): I18nRef[] {
  return (facet.groups ?? []).map((group) => group.label);
}

/** Every ref a math facet emits: each step's formula and term labels (deduplicated). */
export function mathFacetRefs(facet: MathFacet): I18nRef[] {
  return uniqueRefs(facet.steps.flatMap((step) => [step.formula, ...step.terms.map((term) => term.label)]));
}

/** Every ref a table facet emits: its title. */
export function tableFacetRefs(facet: TableFacet): I18nRef[] {
  return [facet.title];
}

/** Param field names that are not keys of the manifest's `defaults`. */
export function unknownParamFields(fields: readonly ParamField[], defaults: unknown): string[] {
  const known = typeof defaults === 'object' && defaults !== null ? Object.keys(defaults) : [];
  return fields.map((field) => field.name).filter((name) => !known.includes(name));
}

/** Declared facet kinds absent from the bundle (any variant counts). */
export function missingFacetKinds(declared: readonly FacetKind[], bundle: TraceBundle): FacetKind[] {
  const present = new Set(Object.keys(bundle.facets).map((key) => key.split('@')[0]));
  return declared.filter((kind) => !present.has(kind));
}

function sameSnapshot(a: Snapshot<string>, b: Snapshot<string>): boolean {
  return JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
}

/** Snapshot after each step, replaying every write from `initial` (the reference semantics). */
export function sequentialReplay(facet: AnyStateFacet): Snapshot<string>[] {
  const snapshots: Snapshot<string>[] = [];
  facet.steps.reduce((snapshot, step) => {
    const next = applyWrites(snapshot, step.writes);
    snapshots.push(next);
    return next;
  }, facet.initial);
  return snapshots;
}

/** Keyframes and `stateAt` must both equal a full sequential replay. */
export function replayProblems(facet: AnyStateFacet): string[] {
  const reference = sequentialReplay(facet);
  const keyframeProblems = facet.keyframes
    .filter((keyframe) => {
      const expected = reference[keyframe.step];
      return expected === undefined || !sameSnapshot(keyframe.snapshot, expected);
    })
    .map((keyframe) => `keyframe at step ${keyframe.step} differs from replay`);
  const stateAtProblems = reference.flatMap((snapshot, step) => (sameSnapshot(stateAt(facet, step), snapshot) ? [] : [`stateAt(${step}) differs from replay`]));
  return [...keyframeProblems, ...stateAtProblems];
}

/** The value after a JSON round trip; deep-equal to the input iff it is JSON-serializable. */
export function jsonRoundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** Math steps that point past the state facet (`stepCount` state steps): views could never show them. */
export function mathStepRangeProblems(facet: MathFacet, stepCount: number): string[] {
  return facet.steps.filter(({ step }) => step >= stepCount).map(({ step }) => `math step ${step} has no state step (0..${stepCount - 1})`);
}

/**
 * A table's `selectParam` must name a param of `manifest.defaults`, and its selected index, written
 * as hex into that param of `params`, must pass `validate` unchanged (clicking the cell re-runs it).
 */
export function tableSelectParamProblems<P>(facet: TableFacet, manifest: Pick<PrimitiveManifest<P>, 'defaults' | 'validate'>, params: P): string[] {
  const { selectParam, selected } = facet;
  if (selectParam === undefined) return [];
  if (!Object.keys(manifest.defaults as object).includes(selectParam)) return [`table: selectParam "${selectParam}" is not a key of manifest.defaults`];
  if (selected === undefined) return [];
  const hex = byteToHex(selected);
  const validated = manifest.validate({ ...params, [selectParam]: hex });
  const roundTrips = validated.ok && (validated.value as Record<string, unknown>)[selectParam] === hex;
  return roundTrips ? [] : [`table: selected ${selected} as ${selectParam} "${hex}" does not round-trip through validate`];
}
