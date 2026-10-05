import { paramFieldsOf, portOptions, portParamFields, type DeriverManifest, type DerivationFacet, type PrimitiveManifest, type ProducerLookup, type TraceBundle } from '@cryventure/core';
import { deriverManifests } from '@cryventure/derivers';
import { isDeriverApplicable } from '@cryventure/viz';
import { producerRegistry } from './producers.ts';
import { runProducer } from './runProducer.ts';

/**
 * Server-side only: which derivers a lab can actually use, decided before the learner's run.
 *
 * `appliesTo` needs a bundle, which the manifest cannot give, so the build runs each producer on its
 * defaults and every preset (producers are deterministic and fast) and keeps the derivers that apply
 * to at least one of those runs. A producer that runs in a worker (`runIn: 'worker'`, e.g. PBKDF2's
 * 80 000-iteration preset) is too heavy for that and is sampled on its defaults only. Today's derivers decide by producer identity plus a param the
 * defaults already set (`isAesOpBundle`), so the samples settle them exactly.
 */

/** The params a producer is sampled on: its defaults, plus its presets unless it runs in a worker. */
function sampleParams(producer: PrimitiveManifest): unknown[] {
  const presets = producer.runIn === 'worker' ? [] : producer.presets.map((preset) => preset.params);
  return [producer.defaults, ...presets];
}

/**
 * The defaults with one member field (docs/M7.md §1b) set to each of its options: one sample per
 * member the learner can pick, whose run may zoom elsewhere (e.g. HMAC-SHA-1 into the SHA-1 lab).
 */
export function memberSampleParams(producer: PrimitiveManifest, registered: readonly PrimitiveManifest[] = producerRegistry.list()): unknown[] {
  const memberFields = portParamFields(paramFieldsOf(producer)).filter((field) => field.member === true);
  return memberFields.flatMap((field) => portOptions(registered, field).map((option) => ({ ...(producer.defaults as object), [field.name]: option.value })));
}

/** The bundles of runs of `producer` on each of `params` (failed runs are left out). */
async function runSamples(producer: PrimitiveManifest, params: readonly unknown[], producers: ProducerLookup): Promise<TraceBundle[]> {
  const results = await Promise.all(params.map((sample) => runProducer(producer, sample, producers)));
  return results.flatMap((result) => (result.ok ? [result.trace] : []));
}

/** The bundles of a producer's sample params (`sampleParams`; failed runs are left out). */
export function sampleBundles(producer: PrimitiveManifest, producers: ProducerLookup = producerRegistry): Promise<TraceBundle[]> {
  return runSamples(producer, sampleParams(producer), producers);
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
  /** The sample bundles plus one per pickable member (`memberSampleParams`). */
  labSamples: readonly TraceBundle[];
}

async function sampleFactsOf(producer: PrimitiveManifest): Promise<SampleFacts> {
  const [bundles, memberBundles] = await Promise.all([sampleBundles(producer), runSamples(producer, memberSampleParams(producer), producerRegistry)]);
  return { derivers: deriversApplicableToAny(bundles), labSamples: [...bundles, ...memberBundles] };
}

async function sampleFacts(): Promise<ReadonlyMap<string, SampleFacts>> {
  const entries = await Promise.all(producerRegistry.list().map(async (producer) => [producer.id, await sampleFactsOf(producer)] as const));
  return new Map(entries);
}

/** Every registered producer's sample facts, computed once when the build loads this module. */
const SAMPLE_FACTS = await sampleFacts();

/** A registered producer's sample-applicable derivers; `undefined` for a producer the registry does not know. */
export function sampleApplicableDerivers(producerId: string): readonly DeriverManifest[] | undefined {
  return SAMPLE_FACTS.get(producerId)?.derivers;
}

/**
 * A registered producer's sample bundles plus one per pickable member, so their zoom targets
 * (`zoomTargetsOf`) cover whichever member the learner picks; empty for an unknown producer.
 */
export function labSamples(producerId: string): readonly TraceBundle[] {
  return SAMPLE_FACTS.get(producerId)?.labSamples ?? [];
}
