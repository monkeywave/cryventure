import { preparePorts, Registry, type PrimitiveManifest, type ProducerLookup, type RunOptions, type RunResult } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';

/**
 * Running producers with `port` params outside the web host (contract kit, oracles): the same
 * `preparePorts` the host and the worker use, against the producers the caller passes.
 */

/** Registered producers: the list (port field options) and the lookup (`resolve`). */
export interface ProducerSet {
  list: readonly PrimitiveManifest[];
  lookup: ProducerLookup;
}

/** An id-keyed registry of `manifests`. */
export function producerRegistry(manifests: readonly PrimitiveManifest[]): Registry<PrimitiveManifest> {
  const registry = new Registry<PrimitiveManifest>('producers');
  manifests.forEach((manifest) => registry.register(manifest));
  return registry;
}

/** Every registered primitive, for resolving ports. */
export const primitiveProducers: ProducerLookup = producerRegistry(primitiveManifests);

/** Every registered primitive as a `ProducerSet`, for callers of the contract kit. */
export const primitiveProducerSet: ProducerSet = { list: primitiveManifests, lookup: primitiveProducers };

/** `{ resolve }` for running `manifest` with `params` (resolves its port params). */
export async function runOptionsFor<P>(manifest: PrimitiveManifest<P>, params: unknown, producers: ProducerLookup = primitiveProducers): Promise<RunOptions> {
  return { resolve: await preparePorts(manifest, params, producers) };
}

/** Loads `manifest`'s module and runs `params` with its ports resolved. */
export async function runWithPorts<P>(manifest: PrimitiveManifest<P>, params: P, producers: ProducerLookup): Promise<RunResult> {
  const [module, options] = await Promise.all([manifest.load(), runOptionsFor(manifest, params, producers)]);
  return module.run(params, options);
}
