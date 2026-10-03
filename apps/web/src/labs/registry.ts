import { availableFacetKinds, i18nRef, viewsFor, type DeriverManifest, type FacetKind, type I18nRef, type PrimitiveManifest, type Registry, type TraceBundle } from '@cryventure/core';
import { deriverManifests } from '@cryventure/derivers';
import { viewManifests } from '@cryventure/views';
import { hasDeriverInputs, isDeriverApplicable, type ReactViewManifest } from '@cryventure/viz';
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
  /** Derivers that can feed views (the app's default: every registered deriver plugin). */
  derivers: readonly DeriverManifest[];
}

export const defaultRegistries: LabRegistries = { producers: producerRegistry, views: viewRegistry, derivers: deriverManifests };

/**
 * Views a producer can feed before any run: its declared facets plus one hop through `derivers`.
 * `appliesTo` needs a bundle, so with every deriver this is a superset; `labMessages` narrows the
 * derivers by a sample run (`sampleDerivers.ts`), and `startLab` preloads per bundle (`viewsForBundle`).
 */
export function viewsForProducer(
  producer: Pick<PrimitiveManifest, 'facets'>,
  views: Registry<ReactViewManifest> = viewRegistry,
  derivers: readonly DeriverManifest[] = deriverManifests,
): ReactViewManifest[] {
  return viewsFor(views.list(), producer.facets, derivers);
}

/**
 * The derivers whose inputs a producer's declared `facets` cover, before any run (viz
 * `hasDeriverInputs`, the bundle-free half of `isDeriverApplicable`; `appliesTo` needs a bundle).
 */
export function deriversForFacets(facets: readonly FacetKind[], derivers: readonly DeriverManifest[] = deriverManifests): DeriverManifest[] {
  return derivers.filter((deriver) => hasDeriverInputs(deriver, facets));
}

/** Views this run's bundle can feed: its facet kinds plus the derivers applicable to it (viz `isDeriverApplicable`; recomputed after every run). */
export function viewsForBundle(
  bundle: TraceBundle,
  views: Registry<ReactViewManifest> = viewRegistry,
  derivers: readonly DeriverManifest[] = deriverManifests,
): ReactViewManifest[] {
  const kinds = availableFacetKinds(bundle);
  return viewsFor(views.list(), kinds, derivers.filter((deriver) => isDeriverApplicable(deriver, bundle, kinds)));
}

/** Looks up a producer and the views it can feed; unknown ids yield an i18n error. */
export function resolveLab(producerId: string, registries: LabRegistries = defaultRegistries): ResolveLabResult {
  const producer = registries.producers.get(producerId);
  if (producer === undefined) return { ok: false, error: i18nRef('ui.lab.error.unknownProducer', { id: producerId }) };
  return { ok: true, lab: { producer, views: viewsForProducer(producer, registries.views, registries.derivers) } };
}
