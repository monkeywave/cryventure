import { availableFacetKinds, type DeriverManifest, type FacetKey, type FacetKind, type TraceBundle } from '@cryventure/core';

/** What one `derive()` call returns: every facet (all variants) the deriver provides for the bundle. */
export type DerivedFacets = Partial<Record<FacetKey, unknown>>;

/** Where one deriver stands for one bundle: never requested, running, done, or failed (never retried). */
export type DerivationStatus = 'idle' | 'pending' | 'fulfilled' | 'rejected';

interface Derivation {
  promise: Promise<DerivedFacets>;
  status: DerivationStatus;
  /** The facets, once fulfilled: lets the lab order variants by deriver, not by completion time. */
  result?: DerivedFacets;
}

/** Per bundle, per deriver id: dropped with the bundle, so a re-run (a new bundle) starts afresh. */
const derivations = new WeakMap<TraceBundle, Map<string, Derivation>>();

function derivationsOf(bundle: TraceBundle): Map<string, Derivation> {
  let perBundle = derivations.get(bundle);
  if (perBundle === undefined) {
    perBundle = new Map();
    derivations.set(bundle, perBundle);
  }
  return perBundle;
}

function startDerivation(bundle: TraceBundle, deriver: DeriverManifest): Derivation {
  const derivation: Derivation = { status: 'pending', promise: Promise.resolve({}) };
  derivation.promise = Promise.resolve()
    .then(() => deriver.load())
    .then((module) => module.derive(bundle))
    .then(
      (facets) => {
        derivation.status = 'fulfilled';
        derivation.result = facets;
        return facets;
      },
      (error: unknown) => {
        derivation.status = 'rejected';
        console.error(`deriver "${deriver.id}" failed for producer "${bundle.producer.id}"`, error);
        throw error;
      },
    );
  return derivation;
}

/**
 * Runs `deriver` over `bundle` at most once: every later call (any view) gets the same promise. A
 * failure is logged once and stays cached, so it is not retried for that bundle.
 */
export function deriveOnce(bundle: TraceBundle, deriver: DeriverManifest): Promise<DerivedFacets> {
  const perBundle = derivationsOf(bundle);
  let derivation = perBundle.get(deriver.id);
  if (derivation === undefined) {
    derivation = startDerivation(bundle, deriver);
    perBundle.set(deriver.id, derivation);
  }
  return derivation.promise;
}

/** Synchronous status of `deriveOnce(bundle, deriver)`; `idle` until first requested. */
export function derivationStatus(bundle: TraceBundle, deriverId: string): DerivationStatus {
  return derivations.get(bundle)?.get(deriverId)?.status ?? 'idle';
}

/** The facets `deriveOnce(bundle, deriver)` produced; `undefined` until it is fulfilled. */
export function derivationResult(bundle: TraceBundle, deriverId: string): DerivedFacets | undefined {
  return derivations.get(bundle)?.get(deriverId)?.result;
}

/**
 * Whether `kinds` cover the deriver's inputs (`from` ⊆ `kinds`): the part of `isDeriverApplicable`
 * that needs no bundle, e.g. for a producer's declared facets before any run.
 */
export function hasDeriverInputs(deriver: DeriverManifest, kinds: readonly FacetKind[]): boolean {
  const available = new Set(kinds);
  return deriver.from.every((kind) => available.has(kind));
}

/** Whether the deriver can run on the bundle: `from` ⊆ the bundle's kinds (`hasDeriverInputs`) and `appliesTo` (default true). */
export function isDeriverApplicable(deriver: DeriverManifest, bundle: TraceBundle, kinds: readonly FacetKind[] = availableFacetKinds(bundle)): boolean {
  return hasDeriverInputs(deriver, kinds) && (deriver.appliesTo?.(bundle) ?? true);
}

/** The derivers that could provide `kind` for `bundle`, in the given order. */
export function derivationCandidates(derivers: readonly DeriverManifest[], bundle: TraceBundle, kind: FacetKind): DeriverManifest[] {
  const providers = derivers.filter((deriver) => deriver.provides.includes(kind));
  if (providers.length === 0) return [];
  const kinds = availableFacetKinds(bundle);
  return providers.filter((deriver) => isDeriverApplicable(deriver, bundle, kinds));
}
