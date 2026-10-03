import { availableFacetKinds, i18nRef, viewsFor, type DeriverManifest, type FacetKind, type I18nRef, type PrimitiveManifest, type Registry, type TraceBundle } from '@cryventure/core';
import { deriverManifests } from '@cryventure/derivers';
import { viewManifests } from '@cryventure/views';
import type { ReactViewManifest } from '@cryventure/viz';
import { buildRegistry, producerRegistry } from './producers.ts';

export { buildRegistry, producerRegistry };
export const viewRegistry = buildRegistry<ReactViewManifest>('views', viewManifests);

export interface ResolvedLab {
  producer: PrimitiveManifest;
  /** Views whose required facets the producer declares, directly or one deriver hop away (`viewsForProducer`). */
  views: ReactViewManifest[];
}

export type ResolveLabResult = { ok: true; lab: ResolvedLab } | { ok: false; error: I18nRef };

export interface LabRegistries {
  producers: Registry<PrimitiveManifest>;
  views: Registry<ReactViewManifest>;
  /** Derivers that can feed views (default: every registered deriver plugin). */
  derivers?: readonly DeriverManifest[];
}

const defaultRegistries: LabRegistries = { producers: producerRegistry, views: viewRegistry, derivers: deriverManifests };

/** Views offered for a set of facet kinds (no derivers registered yet in M0). */
export function viewsForFacets(facets: readonly FacetKind[], views: Registry<ReactViewManifest> = viewRegistry): ReactViewManifest[] {
  return viewsFor(views.list(), facets);
}

/**
 * Views a producer can feed before any run (SSR poster, preloading): its declared facets plus one
 * deriver hop. `appliesTo` needs a bundle, so this may offer views a given run cannot feed.
 */
export function viewsForProducer(
  producer: Pick<PrimitiveManifest, 'facets'>,
  views: Registry<ReactViewManifest> = viewRegistry,
  derivers: readonly DeriverManifest[] = deriverManifests,
): ReactViewManifest[] {
  return viewsFor(views.list(), producer.facets, derivers);
}

/**
 * The derivers whose inputs `facets` cover (`from` ⊆ `facets`), ignoring `appliesTo` (it needs a
 * bundle). The one place the app checks a deriver's inputs: `labMessages` (declared facets) and
 * `applicableDerivers` (a bundle's facets) both go through it.
 */
export function deriversForFacets(facets: readonly FacetKind[], derivers: readonly DeriverManifest[] = deriverManifests): DeriverManifest[] {
  const available = new Set(facets);
  return derivers.filter((deriver) => deriver.from.every((kind) => available.has(kind)));
}

/** The derivers that can run on this bundle (`from` ⊆ its facet kinds and `appliesTo`). */
export function applicableDerivers(bundle: TraceBundle, derivers: readonly DeriverManifest[] = deriverManifests): DeriverManifest[] {
  return deriversForFacets(availableFacetKinds(bundle), derivers).filter((deriver) => deriver.appliesTo?.(bundle) ?? true);
}

/** Views this run's bundle can feed: its facet kinds plus the applicable derivers' (recomputed after every run). */
export function viewsForBundle(
  bundle: TraceBundle,
  views: Registry<ReactViewManifest> = viewRegistry,
  derivers: readonly DeriverManifest[] = deriverManifests,
): ReactViewManifest[] {
  return viewsFor(views.list(), availableFacetKinds(bundle), applicableDerivers(bundle, derivers));
}

/** Looks up a producer and the views it can feed; unknown ids yield an i18n error. */
export function resolveLab(producerId: string, registries: LabRegistries = defaultRegistries): ResolveLabResult {
  const producer = registries.producers.get(producerId);
  if (producer === undefined) return { ok: false, error: i18nRef('ui.lab.error.unknownProducer', { id: producerId }) };
  return { ok: true, lab: { producer, views: viewsForProducer(producer, registries.views, registries.derivers ?? deriverManifests) } };
}
