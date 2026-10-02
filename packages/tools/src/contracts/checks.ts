import {
  applyWrites,
  extractParams,
  getFacet,
  stateAt,
  type FacetKind,
  type I18nRef,
  type NarrationFacet,
  type ParamField,
  type Snapshot,
  type StateFacet,
  type TraceBundle,
  type ValuesFacet,
} from '@cryventure/core';
import { CONTRACT_LOCALES, type LocaleCatalogs } from './catalogs.ts';

/** Pure contract checks; each returns a list of human-readable problems (empty = pass). */
export type AnyStateFacet = StateFacet<string, { op: string }>;

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
      const template = catalogs[locale][ref.key];
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

/** Label keys a run declares at runtime: state region labels and ValueRef labels. */
export function runtimeLabelKeys(bundle: TraceBundle): string[] {
  const regions = getFacet<AnyStateFacet>(bundle, 'state')?.regions.map((region) => region.labelKey) ?? [];
  const values = getFacet<ValuesFacet>(bundle, 'values')?.values.map((value) => value.labelKey) ?? [];
  return [...new Set([...regions, ...values])];
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
