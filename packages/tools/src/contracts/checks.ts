import {
  applyWrites,
  byteToHex,
  elemBytes,
  extractParams,
  getFacet,
  INITIAL_STEP_INDEX,
  narrationAt,
  PLURAL_CATEGORIES,
  resolveMessageKey,
  regionSize,
  stateAt,
  type AnyStateFacet,
  type DerivationFacet,
  type FacetKind,
  type I18nRef,
  type Messages,
  type NarrationFacet,
  type ParamField,
  type PrimitiveManifest,
  type RegionSpec,
  type Snapshot,
  type SpongeFacet,
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

/** The `{{params}}` a ref may pass: its template's, or the union over all plural forms (`_one`, `_other`, …) when it resolves to one. */
function templateParams(catalog: Messages, refKey: string, resolvedKey: string): string[] {
  if (resolvedKey === refKey) return extractParams(catalog[resolvedKey] ?? '');
  const forms = PLURAL_CATEGORIES.map((category) => catalog[`${refKey}_${category}`]).filter((template) => template !== undefined);
  return [...new Set(forms.flatMap(extractParams))];
}

/** Refs whose key is missing or whose params differ from the template's `{{params}}` (across all plural forms of the key). */
export function refProblems(refs: readonly I18nRef[], catalogs: LocaleCatalogs): string[] {
  return CONTRACT_LOCALES.flatMap((locale) =>
    refs.flatMap((ref) => {
      const key = resolveMessageKey(catalogs[locale], ref.key, ref.params, locale);
      if (key === undefined) return [`${locale}:${ref.key} missing`];
      const used = templateParams(catalogs[locale], ref.key, key);
      const given = Object.keys(ref.params ?? {});
      return sameNames(given, used) ? [] : [`${locale}:${ref.key} params [${given.join()}] vs template [${used.join()}]`];
    }),
  );
}

function uniqueRefs(refs: readonly I18nRef[]): I18nRef[] {
  return [...new Map(refs.map((ref) => [JSON.stringify(ref), ref])).values()];
}

/** Every narration ref a bundle emits: narration facet entries plus the state facet's initial and per-step narration. */
export function emittedNarration(bundle: TraceBundle): I18nRef[] {
  const narration = getFacet<NarrationFacet>(bundle, 'narration')?.entries.map((entry) => entry.ref) ?? [];
  const state = getFacet<AnyStateFacet>(bundle, 'state');
  const initial = state?.initialNarration === undefined ? [] : [state.initialNarration];
  const steps = state?.steps.map((step) => step.narration) ?? [];
  return uniqueRefs([...narration, ...initial, ...steps]);
}

/**
 * The narration facet's step −1 entry must be the state facet's `initialNarration` (both present
 * and equal, or both absent), as `narrationFromState` emits it. Bundles without either facet pass.
 */
export function initialNarrationProblems(bundle: TraceBundle): string[] {
  const narration = getFacet<NarrationFacet>(bundle, 'narration');
  const state = getFacet<AnyStateFacet>(bundle, 'state');
  if (narration === undefined || state === undefined) return [];
  const expected = state.initialNarration;
  const actual = narrationAt(narration, INITIAL_STEP_INDEX);
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  if (actual === undefined) return [`narration step -1 is missing, but the state facet has initialNarration "${expected!.key}"`];
  if (expected === undefined) return [`narration step -1 is "${actual.key}", but the state facet has no initialNarration`];
  return [`narration step -1 ${JSON.stringify(actual)} differs from the state facet's initialNarration ${JSON.stringify(expected)}`];
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

const WORD_BYTE_ORDERS: readonly unknown[] = ['big', 'little'];

/**
 * `words` layouts whose `wordBytes` is not a positive integer dividing the region's byte size, or
 * whose `byteOrder` (optional) is not `big` or `little`.
 */
export function regionLayoutProblems(regions: readonly RegionSpec<string>[]): string[] {
  return regions.flatMap((region) => {
    if (region.layout?.kind !== 'words') return [];
    const { wordBytes, byteOrder } = region.layout;
    const bytes = regionSize(region) * elemBytes(region.elem);
    const divides = Number.isInteger(wordBytes) && wordBytes > 0 && bytes % wordBytes === 0;
    const problems = divides ? [] : [`region "${region.id}": wordBytes ${wordBytes} does not divide its ${bytes} bytes`];
    if (byteOrder !== undefined && !WORD_BYTE_ORDERS.includes(byteOrder)) problems.push(`region "${region.id}": byteOrder "${String(byteOrder)}" is not "big" or "little"`);
    return problems;
  });
}

/** The label refs of a derivation facet's declared groups. */
export function derivationGroupRefs(facet: DerivationFacet): I18nRef[] {
  return (facet.groups ?? []).map((group) => group.label);
}

/** A per-step facet whose steps carry a formula and labelled terms (`math`, `field`, `wordops`). */
export interface TermFacet {
  steps: readonly { step: number; formula: I18nRef; terms: readonly { id: string; label: I18nRef; valueRef?: string }[] }[];
}

/** Every ref a term facet emits: each step's formula and term labels (deduplicated). */
export function termFacetRefs(facet: TermFacet): I18nRef[] {
  return uniqueRefs(facet.steps.flatMap((step) => [step.formula, ...step.terms.map((term) => term.label)]));
}

/** Term `valueRef`s that the bundle's `values` facet does not declare; `kind` prefixes each problem. */
export function termValueRefProblems(kind: string, facet: TermFacet, values: Pick<ValuesFacet, 'values'> | undefined): string[] {
  const known = new Set(values?.values.map((value) => value.id) ?? []);
  return facet.steps.flatMap((step) =>
    step.terms
      .filter((term) => term.valueRef !== undefined && !known.has(term.valueRef))
      .map((term) => `${kind} step ${step.step} term "${term.id}": valueRef "${term.valueRef}" is not in the values facet`),
  );
}

/** Every ref a sponge facet emits: its label. */
export function spongeFacetRefs(facet: SpongeFacet): I18nRef[] {
  return [facet.label];
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

/**
 * Steps of a per-step facet (`math`, `field`, `wordops`, `sponge`) outside the state facet's steps −1..n−1 (views could
 * never show them), and a step −1 entry on a state facet without an `initialNarration` (the initial
 * state must be narrated). `kind` prefixes each problem.
 */
export function facetStepRangeProblems(kind: string, facet: { steps: readonly { step: number }[] }, state: Pick<AnyStateFacet, 'steps' | 'initialNarration'>): string[] {
  const last = state.steps.length - 1;
  return facet.steps.flatMap(({ step }) => {
    if (step < INITIAL_STEP_INDEX || step > last) return [`${kind} step ${step} has no state step (${INITIAL_STEP_INDEX}..${last})`];
    if (step === INITIAL_STEP_INDEX && state.initialNarration === undefined) return [`${kind} step ${step} (initial state) has no initialNarration on the state facet`];
    return [];
  });
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

/**
 * Params that `validate()` does not return unchanged, compared key by key over the union of both key
 * sets in any order (mirrors the web app's `matchingPresetId`): a default or preset the validator adds
 * keys to or normalises (case, separators) would never match itself once validated, so it would show as "Custom".
 */
export function normalFormProblems<P>(manifest: Pick<PrimitiveManifest<P>, 'validate'>, cases: readonly { name: string; params: P }[]): string[] {
  return cases.flatMap(({ name, params }) => {
    const validated = manifest.validate(params);
    if (!validated.ok) return [`${name}: rejected by validate() (${validated.error.key})`];
    const given = params as Record<string, unknown>;
    const normal = validated.value as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(given), ...Object.keys(normal)])].sort();
    return keys
      .filter((key) => JSON.stringify(given[key]) !== JSON.stringify(normal[key]))
      .map((key) => `${name}: ${key} is ${JSON.stringify(given[key]) ?? 'undefined'}, validate() gives ${JSON.stringify(normal[key]) ?? 'undefined'}`);
  });
}
