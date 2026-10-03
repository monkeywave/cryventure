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

/** Which deriver produced a derived facet key (its id), if known. */
export type FacetOwner = (key: FacetKey) => string | undefined;

function variantOf(key: FacetKey): string {
  return parseFacetKey(key)?.variant ?? DEFAULT_VARIANT;
}

function keysIn(facets: DerivedCache, kind: FacetKind): FacetKey[] {
  return (Object.keys(facets) as FacetKey[]).filter((key) => facets[key] !== undefined && parseFacetKey(key)?.kind === kind);
}

/** The deriver (by `deriveOnce` result) that produced `key` for `bundle`. */
function ownerFromDerivations(bundle: TraceBundle, derivers: readonly DeriverManifest[]): FacetOwner {
  return (key) => derivers.find((deriver) => derivationResult(bundle, deriver.id)?.[key] !== undefined)?.id;
}

/**
 * Derived keys ordered by their deriver's position in `derivers` (sorted by id upstream), not by the
 * order derivations completed in; keys without a known deriver keep their insertion order, last.
 */
function inDeriverOrder(keys: readonly FacetKey[], derivers: readonly DeriverManifest[], ownerOf: FacetOwner): FacetKey[] {
  const rank = (key: FacetKey) => {
    const index = derivers.findIndex((deriver) => deriver.id === ownerOf(key));
    return index === -1 ? derivers.length : index;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

/**
 * Variants of `kind` in the bundle, then in the derived cache, without duplicates. Derived variants
 * follow the order of `derivers` (deterministic whatever order derivations finish in).
 */
export function facetVariants(
  bundle: TraceBundle | null,
  derived: DerivedCache,
  kind: FacetKind,
  derivers: readonly DeriverManifest[] = [],
  ownerOf: FacetOwner = bundle === null ? () => undefined : ownerFromDerivations(bundle, derivers),
): string[] {
  if (bundle === null) return [];
  const own = keysIn(bundle.facets, kind);
  const fromDerivers = inDeriverOrder(keysIn(derived, kind), derivers, ownerOf);
  return [...new Set([...own, ...fromDerivers].map(variantOf))];
}

/** The variant `useFacet` shows when none is asked for: `default` if present, else the first one. */
export function defaultVariant(variants: readonly string[]): string | undefined {
  return variants.includes(DEFAULT_VARIANT) ? DEFAULT_VARIANT : variants[0];
}

/** A variant name's tokens (split on `-`, `+`, `_`, `.`), e.g. `x86_64-aesni` → `x86`, `64`, `aesni`. */
function nameTokens(variant: string): Set<string> {
  return new Set(variant.split(/[-+_.]/).filter((token) => token !== ''));
}

/** How many name tokens `variant` shares with `preference`. */
function sharedTokens(variant: string, preference: string): number {
  const wanted = nameTokens(preference);
  return [...nameTokens(variant)].filter((token) => wanted.has(token)).length;
}

/** The variant sharing the most name tokens with `preference` (ties: earliest in `variants`); none if no token is shared. */
function closestVariant(variants: readonly string[], preference: string): string | undefined {
  let best: string | undefined;
  let bestScore = 0;
  for (const variant of variants) {
    const score = sharedTokens(variant, preference);
    if (score > bestScore) [best, bestScore] = [variant, score];
  }
  return best;
}

/** The first preferred variant `variants` has exactly (most recent preference first). */
function exactPreferred(variants: readonly string[], preferred: readonly string[]): string | undefined {
  return preferred.find((variant) => variants.includes(variant));
}

/**
 * The lab-wide choice for one kind (docs/M4.md §1f): the first preferred variant it has exactly; else
 * the variant sharing the most name tokens with the most recent preference that shares any (ties:
 * deriver order), so `x86_64-aesni` carries over to `x86_64-linux-gnu+aesni`; else `defaultVariant`.
 */
export function preferredVariant(variants: readonly string[], preferred: readonly string[]): string | undefined {
  const exact = exactPreferred(variants, preferred);
  if (exact !== undefined) return exact;
  for (const preference of preferred) {
    const closest = closestVariant(variants, preference);
    if (closest !== undefined) return closest;
  }
  return defaultVariant(variants);
}

/**
 * `preferredVariant`, but only once it cannot change: while a candidate deriver is `pending`, a later
 * variant could win (a closer token match, or one earlier in deriver order), so only an exact preferred
 * match, or the bundle's `default` without preferences, is final; otherwise `undefined` (loading).
 */
export function settledVariant(variants: readonly string[], preferred: readonly string[], pending: boolean): string | undefined {
  if (!pending) return preferredVariant(variants, preferred);
  const exact = exactPreferred(variants, preferred);
  if (exact !== undefined) return exact;
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
          store.getState().setDerivedFacets(bundle, facets, deriver.id);
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

/** Requests derivation of `kind` and tracks its variants; shared by `useFacet`, `useFacetVariants` and `useChosenVariant`. */
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

/** The variants of a kind and the one the lab shows (`settledVariant`; `undefined` while it may still change). */
export function useChosenVariant(kind: FacetKind): { variants: string[]; current: string | undefined; pending: boolean } {
  const { variants, pending } = useKind(kind);
  const preferred = useLab((state) => state.preferredVariants);
  const current = useMemo(() => settledVariant(variants, preferred, pending), [variants, preferred, pending]);
  return { variants, current, pending };
}

/**
 * A facet of the current lab's bundle; the caller asserts its type. Without a `variant`: the lab-wide
 * choice (`settledVariant`: exact preference, else closest name, else `default`, else the first in
 * deriver order), `loading` while a still-running deriver could change that choice. A facet the bundle
 * lacks but an applicable deriver provides is `loading` while that deriver runs, then `ready` (or
 * `missing` if derivation failed or did not produce it).
 */
export function useFacet<T>(kind: FacetKind, variant?: string): FacetResult<T> {
  const { bundle, derived, variants, pending } = useKind(kind);
  const preferred = useLab((state) => state.preferredVariants);
  const chosen = variant ?? settledVariant(variants, preferred, pending);
  return useMemo(() => {
    if (chosen === undefined && pending) return LOADING;
    return lookupFacet<T>(bundle, derived, kind, chosen, pending);
  }, [bundle, derived, kind, chosen, pending]);
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
