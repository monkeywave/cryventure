import { i18nRef, preparePorts, type PrimitiveManifest, type ProducerLookup, type RunResult } from '@cryventure/core';
import { producerRegistry } from './producers.ts';

/** The run error for a producer (or its worker) that could not be loaded. */
export const LOAD_FAILED: RunResult = { ok: false, error: i18nRef('ui.lab.error.loadFailed') };

/**
 * Loads the producer implementation (code-split) and the ports its params name (`preparePorts`,
 * docs/M3.md §2), then runs it with the synchronous `resolve`; a failed import becomes an i18n error.
 * Shared by the main thread and the producer worker.
 */
export async function runProducer<P>(producer: PrimitiveManifest<P>, params: P, producers: ProducerLookup = producerRegistry): Promise<RunResult> {
  try {
    const [module, resolve] = await Promise.all([producer.load(), preparePorts(producer, params, producers)]);
    return module.run(params, { resolve });
  } catch {
    return LOAD_FAILED;
  }
}
