import { availableFacetKinds, facetKey, getFacet, type FacetKind, type PrimitiveManifest, type TraceBundle } from '@cryventure/core';
import { runOrThrow } from './primitiveContract.ts';
import { producerRegistry, runOptionsFor } from './runWithPorts.ts';

/**
 * Fixture bundles for rendering views in the contract kit. They are generated from the real
 * primitives (each run with its defaults), so every facet a view sees is one a lab really emits;
 * `fallbacks` supplies a facet per kind for kinds no primitive emits yet.
 */
export type FallbackFacets = Partial<Record<FacetKind, unknown>>;

/** Name of a bundle composed per facet kind from several producers. */
export const ASSEMBLED = 'assembled';

export interface NamedBundle {
  /** The producer the bundle came from, or `assembled` for a per-kind composition. */
  name: string;
  bundle: TraceBundle;
}

export type FixtureSelection = { ok: true; bundles: NamedBundle[] } | { ok: false; problem: string };

/** One bundle per primitive, run with its defaults (port params resolve against `manifests`). */
export async function primitiveFixtureBundles(manifests: readonly PrimitiveManifest[]): Promise<NamedBundle[]> {
  const producers = producerRegistry(manifests);
  return Promise.all(
    manifests.map(async (manifest) => {
      const [module, options] = await Promise.all([manifest.load(), runOptionsFor(manifest, manifest.defaults, producers)]);
      return { name: manifest.id, bundle: runOrThrow(module, manifest.defaults, options) };
    }),
  );
}

/** The facet kinds a bundle carries (any variant). */
export function facetKindsOf(bundle: TraceBundle): Set<FacetKind> {
  return new Set(availableFacetKinds(bundle));
}

/** The first facet of `kind` across the bundles (default variant), else the fallback. */
function facetOfKind(kind: FacetKind, sources: readonly NamedBundle[], fallbacks: FallbackFacets): unknown {
  const source = sources.find(({ bundle }) => facetKindsOf(bundle).has(kind));
  return source === undefined ? fallbacks[kind] : getFacet(source.bundle, kind);
}

/** A bundle composed per facet kind, for views no single producer serves. */
function assembledBundle(kinds: readonly FacetKind[], sources: readonly NamedBundle[], fallbacks: FallbackFacets): FixtureSelection {
  const facets = kinds.map((kind) => [kind, facetOfKind(kind, sources, fallbacks)] as const);
  const missing = facets.filter(([, facet]) => facet === undefined).map(([kind]) => kind);
  if (missing.length > 0) return { ok: false, problem: `no fixture provides facet kind(s) ${missing.join(', ')}: emit them from a primitive or add a fallback in facetFixtures` };
  const base = sources[0]?.bundle ?? { schemaVersion: 1, producer: { kind: 'primitive', id: ASSEMBLED, apiVersion: 1 }, provenance: 'modeled', params: {}, output: {} };
  const bundle: TraceBundle = { ...base, facets: Object.fromEntries(facets.map(([kind, facet]) => [facetKey(kind), facet])) };
  return { ok: true, bundles: [{ name: ASSEMBLED, bundle }] };
}

/**
 * The fixture bundles a view is rendered against: every real bundle carrying all `requires`
 * (optional kinds come along when the producer emits them); else one bundle assembled per kind
 * from `requires` + `optional`; else a problem naming the kinds no fixture provides.
 */
export function fixtureBundlesFor(requires: readonly FacetKind[], optional: readonly FacetKind[], sources: readonly NamedBundle[], fallbacks: FallbackFacets = {}): FixtureSelection {
  const covering = sources.filter(({ bundle }) => requires.every((kind) => facetKindsOf(bundle).has(kind)));
  if (covering.length > 0) return { ok: true, bundles: covering };
  const optionalAvailable = optional.filter((kind) => facetOfKind(kind, sources, fallbacks) !== undefined);
  return assembledBundle([...requires, ...optionalAvailable], sources, fallbacks);
}

/** First, middle and last step of a bundle's timeline (`-1` is the initial state), deduplicated. */
export function representativeSteps(lastStep: number): number[] {
  return [...new Set([-1, Math.floor((lastStep - 1) / 2), lastStep])];
}
