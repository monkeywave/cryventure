import { Registry, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';

/**
 * The producer registry on its own (core + primitive manifests only), so the producer worker can
 * use it without pulling in the React views.
 */

/** Fills a fresh registry; duplicate ids throw (a programming error caught at build time). */
export function buildRegistry<M extends { id: string }>(name: string, manifests: readonly M[]): Registry<M> {
  const registry = new Registry<M>(name);
  manifests.forEach((manifest) => registry.register(manifest));
  return registry;
}

export const producerRegistry = buildRegistry<PrimitiveManifest>('producers', primitiveManifests);
