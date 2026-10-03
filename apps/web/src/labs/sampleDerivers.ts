import type { DeriverManifest, PrimitiveManifest, ProducerLookup, TraceBundle } from '@cryventure/core';
import { deriverManifests } from '@cryventure/derivers';
import { isDeriverApplicable } from '@cryventure/viz';
import { producerRegistry } from './producers.ts';
import { runProducer } from './runProducer.ts';

/**
 * Server-side only: which derivers a lab can actually use, decided before the learner's run.
 *
 * `appliesTo` needs a bundle, which the manifest cannot give, so the build runs each producer on its
 * defaults and every preset (producers are deterministic and fast) and keeps the derivers that apply
 * to at least one of those runs. Today's derivers decide by producer identity plus a param the
 * defaults already set (`isAesOpBundle`), so the samples settle them exactly.
 */

/** The bundles of a producer's defaults and presets (failed runs are left out). */
export async function sampleBundles(producer: PrimitiveManifest, producers: ProducerLookup = producerRegistry): Promise<TraceBundle[]> {
  const params = [producer.defaults, ...producer.presets.map((preset) => preset.params)];
  const results = await Promise.all(params.map((sample) => runProducer(producer, sample, producers)));
  return results.flatMap((result) => (result.ok ? [result.trace] : []));
}

/** The derivers applicable (viz `isDeriverApplicable`) to at least one of `bundles`. */
export function deriversApplicableToAny(bundles: readonly TraceBundle[], derivers: readonly DeriverManifest[] = deriverManifests): DeriverManifest[] {
  return derivers.filter((deriver) => bundles.some((bundle) => isDeriverApplicable(deriver, bundle)));
}

async function sampleApplicability(): Promise<ReadonlyMap<string, readonly DeriverManifest[]>> {
  const entries = await Promise.all(
    producerRegistry.list().map(async (producer) => [producer.id, deriversApplicableToAny(await sampleBundles(producer))] as const),
  );
  return new Map(entries);
}

/** Every registered producer's sample-applicable derivers, computed once when the build loads this module. */
const SAMPLE_APPLICABLE_DERIVERS = await sampleApplicability();

/** A registered producer's sample-applicable derivers; `undefined` for a producer the registry does not know. */
export function sampleApplicableDerivers(producerId: string): readonly DeriverManifest[] | undefined {
  return SAMPLE_APPLICABLE_DERIVERS.get(producerId);
}
