import type { DeriverManifest, DerivationFacet, PrimitiveManifest, ProducerLookup, TraceBundle } from '@cryventure/core';
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

/**
 * The producers whose labs the derivation nodes of `bundles` zoom into (`LabZoom.producerId`), each
 * once, sorted: the zoom links' targets, whose lab titles the lab ships (`labMessages`).
 */
export function zoomTargetsOf(bundles: readonly TraceBundle[]): string[] {
  const facets = bundles.flatMap((bundle) => Object.values(bundle.facets as Record<string, { kind?: string }>));
  const derivations = facets.filter((facet): facet is DerivationFacet => facet.kind === 'derivation');
  const targets = derivations.flatMap((facet) => facet.nodes.flatMap((node) => (node.zoom === undefined ? [] : [node.zoom.producerId])));
  return [...new Set(targets)].sort();
}

interface SampleFacts {
  derivers: readonly DeriverManifest[];
  zoomTargets: readonly string[];
}

async function sampleFacts(): Promise<ReadonlyMap<string, SampleFacts>> {
  const entries = await Promise.all(
    producerRegistry.list().map(async (producer) => {
      const bundles = await sampleBundles(producer);
      return [producer.id, { derivers: deriversApplicableToAny(bundles), zoomTargets: zoomTargetsOf(bundles) }] as const;
    }),
  );
  return new Map(entries);
}

/** Every registered producer's sample facts, computed once when the build loads this module. */
const SAMPLE_FACTS = await sampleFacts();

/** A registered producer's sample-applicable derivers; `undefined` for a producer the registry does not know. */
export function sampleApplicableDerivers(producerId: string): readonly DeriverManifest[] | undefined {
  return SAMPLE_FACTS.get(producerId)?.derivers;
}

/**
 * The producers a registered producer's samples zoom into (`zoomTargetsOf`); empty for an unknown one.
 * A member the learner picks later may zoom elsewhere: its link then falls back to the generic text.
 */
export function sampleZoomTargets(producerId: string): readonly string[] {
  return SAMPLE_FACTS.get(producerId)?.zoomTargets ?? [];
}
