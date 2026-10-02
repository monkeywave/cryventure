import { Registry, i18nRef, viewsFor, type FacetKind, type I18nRef, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import { viewManifests } from '@cryventure/views';
import type { ReactViewManifest } from '@cryventure/viz';

/** Fills a fresh registry; duplicate ids throw (a programming error caught at build time). */
export function buildRegistry<M extends { id: string }>(name: string, manifests: readonly M[]): Registry<M> {
  const registry = new Registry<M>(name);
  manifests.forEach((manifest) => registry.register(manifest));
  return registry;
}

export const producerRegistry = buildRegistry<PrimitiveManifest>('producers', primitiveManifests);
export const viewRegistry = buildRegistry<ReactViewManifest>('views', viewManifests);

export interface ResolvedLab {
  producer: PrimitiveManifest;
  /** Views whose required facets the producer declares. */
  views: ReactViewManifest[];
}

export type ResolveLabResult = { ok: true; lab: ResolvedLab } | { ok: false; error: I18nRef };

export interface LabRegistries {
  producers: Registry<PrimitiveManifest>;
  views: Registry<ReactViewManifest>;
}

const defaultRegistries: LabRegistries = { producers: producerRegistry, views: viewRegistry };

/** Views offered for a set of facet kinds (no derivers registered yet in M0). */
export function viewsForFacets(facets: readonly FacetKind[], views: Registry<ReactViewManifest> = viewRegistry): ReactViewManifest[] {
  return viewsFor(views.list(), facets);
}

/** Looks up a producer and the views it can feed; unknown ids yield an i18n error. */
export function resolveLab(producerId: string, registries: LabRegistries = defaultRegistries): ResolveLabResult {
  const producer = registries.producers.get(producerId);
  if (producer === undefined) return { ok: false, error: i18nRef('ui.lab.error.unknownProducer', { id: producerId }) };
  return { ok: true, lab: { producer, views: viewsForFacets(producer.facets, registries.views) } };
}
