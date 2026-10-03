import type { PrimitiveManifest, TraceBundle } from '@cryventure/core';
import { runCases } from './primitiveContract.ts';
import { runWithPorts, type ProducerSet } from './runWithPorts.ts';

/** One real bundle a deriver may be run on: a primitive run with its defaults or one preset. */
export interface PrimitiveBundleCase {
  /** `<producerId>/<presetId>`, for problem messages. */
  name: string;
  producerId: string;
  /** The preset id, or `defaults`. */
  presetId: string;
  bundle: TraceBundle;
}

/** The preset id of the `defaults` case. */
export const DEFAULTS_PRESET_ID = 'defaults';

/** Runs `params` with ports resolved, failing loudly when the run is rejected. */
async function runCase(manifest: PrimitiveManifest, presetId: string, params: unknown, producers: ProducerSet): Promise<PrimitiveBundleCase> {
  const result = await runWithPorts(manifest, params, producers.lookup);
  if (!result.ok) throw new Error(`${manifest.id}/${presetId}: run() rejected params: ${JSON.stringify(result.error)}`);
  return { name: `${manifest.id}/${presetId}`, producerId: manifest.id, presetId, bundle: result.trace };
}

/** `defaults` plus every preset of every producer in `producers.list`, each run once. */
export async function primitiveBundleCases(producers: ProducerSet): Promise<PrimitiveBundleCase[]> {
  const runs = producers.list.flatMap((manifest) =>
    runCases(manifest).map((testCase, index) => {
      const presetId = index === 0 ? DEFAULTS_PRESET_ID : manifest.presets[index - 1]!.id;
      return runCase(manifest, presetId, testCase.params, producers);
    }),
  );
  return Promise.all(runs);
}

const casesByProducers = new WeakMap<ProducerSet, Promise<PrimitiveBundleCase[]>>();

/** `primitiveBundleCases`, computed once per producer set (every deriver in a test file shares them). */
export function cachedPrimitiveBundleCases(producers: ProducerSet): Promise<PrimitiveBundleCase[]> {
  let cases = casesByProducers.get(producers);
  if (cases === undefined) {
    cases = primitiveBundleCases(producers);
    casesByProducers.set(producers, cases);
  }
  return cases;
}
