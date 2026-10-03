import { useEffect, useMemo, useReducer } from 'react';
import { DEFAULT_VARIANT, facetKey, getFacet, parseFacetKey, type DeriverManifest, type FacetKey, type FacetKind, type TraceBundle } from '@cryventure/core';
import { deriveOnce, derivationCandidates, derivationResult, derivationStatus } from './derive.ts';
import { useDerivers, useLab, useLabStore } from './LabContext.tsx';

export type FacetResult<T> =
  | { status: 'ready'; data: T }
  | { status: 'missing'; data: undefined }
  | { status: 'loading'; data: undefined };

type DerivedCache = Partial<Record<FacetKey, unknown>>;

const LOADING: FacetResult<never> = { status: 'loading', data: undefined };
const MISSING: FacetResult<never> = { status: 'missing', data: undefined };

function variantOf(key: FacetKey): string {
  return parseFacetKey(key)?.variant ?? DEFAULT_VARIANT;
}

function keysIn(facets: DerivedCache, kind: FacetKind): FacetKey[] {
  return (Object.keys(facets) as FacetKey[]).filter((key) => facets[key] !== undefined && parseFacetKey(key)?.kind === kind);
}

/**
 * Derived keys ordered by the position in `derivers` (sorted by id upstream) of the deriver whose
 * `deriveOnce` result holds them, not by the order derivations completed in; keys without a known
 * deriver keep their insertion order, last.
 */
function inDeriverOrder(bundle: TraceBundle, keys: readonly FacetKey[], derivers: readonly DeriverManifest[]): FacetKey[] {
  const rank = (key: FacetKey) => {
    const index = derivers.findIndex((deriver) => derivationResult(bundle, deriver.id)?.[key] !== undefined);
    return index === -1 ? derivers.length : index;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

/**
 * Variants of `kind` in the bundle, then in the derived cache, without duplicates. Derived variants
 * follow the order of `derivers` (deterministic whatever order derivations finish in).
 */
export function facetVariants(bundle: TraceBundle | null, derived: DerivedCache, kind: FacetKind, derivers: readonly DeriverManifest[] = []): string[] {
  if (bundle === null) return [];
  const own = keysIn(bundle.facets, kind);
  const fromDerivers = inDeriverOrder(bundle, keysIn(derived, kind), derivers);
  return [...new Set([...own, ...fromDerivers].map(variantOf))];
}

/** The variant `useFacet` shows when none is asked for: `default` if present, else the first one. */
export function defaultVariant(variants: readonly string[]): string | undefined {
  return variants.includes(DEFAULT_VARIANT) ? DEFAULT_VARIANT : variants[0];
}

/**
 * The lab-wide choice for one kind (docs/M4.md §1f): the most recent preferred id the kind has
 * exactly (variant ids are shared across kinds for the same implementation); else `defaultVariant`
 * (`default`, else the first in deriver order), but only once every candidate deriver has settled, so
 * the choice never flips: while one is `pending`, a non-exact choice is final only for the bundle's
 * own `default` without preferences; otherwise `undefined` (loading).
 */
export function settledVariant(variants: readonly string[], preferred: readonly string[], pending: boolean): string | undefined {
  const exact = preferred.find((variant) => variants.includes(variant));
  if (exact !== undefined) return exact;
  if (!pending) return defaultVariant(variants);
  return preferred.length === 0 && variants.includes(DEFAULT_VARIANT) ? DEFAULT_VARIANT : undefined;
}

/** One facet's data: the bundle's own first, then the derived-facet cache; `undefined` if neither has it. */
export function facetData<T>(bundle: TraceBundle | null, derived: DerivedCache, kind: FacetKind, variant: string): T | undefined {
  if (bundle === null) return undefined;
  return getFacet<T>(bundle, kind, variant) ?? (derived[facetKey(kind, variant)] as T | undefined);
}

/**
 * Bundle facets first, then the derived-facet cache (filled lazily by derivers). Without a `variant`,
 * `default` if present, else the first variant. `loading` until a bundle exists, and while `pending`
 * (a deriver that may still provide the facet has not settled); `missing` otherwise.
 */
export function lookupFacet<T>(bundle: TraceBundle | null, derived: DerivedCache, kind: FacetKind, variant?: string, pending = false): FacetResult<T> {
  if (bundle === null) return LOADING;
  const chosen = variant ?? defaultVariant(facetVariants(bundle, derived, kind)) ?? DEFAULT_VARIANT;
  const data = facetData<T>(bundle, derived, kind, chosen);
  if (data !== undefined) return { status: 'ready', data };
  return pending ? LOADING : MISSING;
}

function isUnsettled(bundle: TraceBundle, deriver: DeriverManifest): boolean {
  const status = derivationStatus(bundle, deriver.id);
  return status === 'idle' || status === 'pending';
}

/**
 * Requests derivation (in an effect, never during render) from every candidate deriver, stores the
 * results (`setDerivedFacets`, stale-guarded) and re-renders once each settles. `deriveOnce` shares
 * the work across views, so several views asking for the same facet run each deriver once.
 */
function useDerivationRequests(bundle: TraceBundle | null, candidates: readonly DeriverManifest[]): void {
  const store = useLabStore();
  const [, settled] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (bundle === null || candidates.length === 0) return;
    let active = true;
    for (const deriver of candidates) {
      deriveOnce(bundle, deriver).then(
        (facets) => {
          store.getState().setDerivedFacets(bundle, facets);
          if (active) settled();
        },
        () => {
          if (active) settled();
        },
      );
    }
    return () => {
      active = false;
    };
  }, [store, bundle, candidates]);
}

/** The derivers that could still provide `kind` for the current bundle. */
function useCandidates(bundle: TraceBundle | null, kind: FacetKind): DeriverManifest[] {
  const derivers = useDerivers();
  return useMemo(() => (bundle === null ? [] : derivationCandidates(derivers, bundle, kind)), [derivers, bundle, kind]);
}

/** Everything the lab knows about one kind: its variants (deriver order) and whether a candidate deriver is still running. */
interface KindState {
  bundle: TraceBundle | null;
  derived: DerivedCache;
  variants: string[];
  pending: boolean;
}

/** Requests derivation of `kind` and tracks its variants; the one subscription behind every facet hook. */
function useKind(kind: FacetKind): KindState {
  const bundle = useLab((state) => state.bundle);
  const derived = useLab((state) => state.derivedFacets);
  const derivers = useDerivers();
  const candidates = useCandidates(bundle, kind);
  useDerivationRequests(bundle, candidates);
  const variants = useMemo(() => facetVariants(bundle, derived, kind, derivers), [bundle, derived, kind, derivers]);
  const pending = bundle !== null && candidates.some((deriver) => isUnsettled(bundle, deriver));
  return { bundle, derived, variants, pending };
}

/** One kind as the lab shows it: its variants, the variant shown (`variant`, else the lab-wide choice) and that variant's facet. */
export interface ShownFacet<T> {
  variants: string[];
  /** `variant` if given, else `settledVariant`; `undefined` while a running deriver could change the choice. */
  current: string | undefined;
  facet: FacetResult<T>;
}

/** `useKind` plus the shown variant and its facet: shared by `useFacet` and `useVariantChoice`. */
export function useShownFacet<T>(kind: FacetKind, variant?: string): ShownFacet<T> {
  const { bundle, derived, variants, pending } = useKind(kind);
  const preferred = useLab((state) => state.preferredVariants);
  const current = variant ?? settledVariant(variants, preferred, pending);
  const facet = useMemo(() => {
    if (current === undefined && pending) return LOADING;
    return lookupFacet<T>(bundle, derived, kind, current, pending);
  }, [bundle, derived, kind, current, pending]);
  return useMemo(() => ({ variants, current, facet }), [variants, current, facet]);
}

/**
 * A facet of the current lab's bundle; the caller asserts its type. Without a `variant`: the lab-wide
 * choice (`settledVariant`: the most recent preferred id, else `default`, else the first in deriver
 * order), `loading` while a still-running deriver could change that choice. A facet the bundle lacks
 * but an applicable deriver provides is `loading` while that deriver runs, then `ready` (or `missing`
 * if derivation failed or did not produce it).
 */
export function useFacet<T>(kind: FacetKind, variant?: string): FacetResult<T> {
  return useShownFacet<T>(kind, variant).facet;
}

/** The variants of `kind` in the bundle plus the derived cache (after derivation), derived ones in deriver order. */
export function useFacetVariants(kind: FacetKind): string[] {
  return useKind(kind).variants;
}

/** Each of `variants` of `kind` with its data (`facetData`: bundle, then derived cache), in the given order. */
export function useVariantFacets<T>(kind: FacetKind, variants: readonly string[]): { variant: string; data: T | undefined }[] {
  const bundle = useLab((state) => state.bundle);
  const derived = useLab((state) => state.derivedFacets);
  return useMemo(() => variants.map((variant) => ({ variant, data: facetData<T>(bundle, derived, kind, variant) })), [variants, bundle, derived, kind]);
}
