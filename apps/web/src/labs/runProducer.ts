import { i18nRef, preparePorts, type PrimitiveManifest, type ProducerLookup, type RunResult } from '@cryventure/core';
import { producerRegistry } from './producers.ts';

/** The run error for a producer (or its worker) that could not be loaded. */
export const LOAD_FAILED: RunResult = { ok: false, error: i18nRef('ui.lab.error.loadFailed') };

/** Why a run failed when the producer (or the lab's handling of its trace) threw: a bug, not a connection problem. */
export const RUN_FAILED_ERROR = i18nRef('ui.lab.error.runFailed');

/** The run error for a producer that loaded but threw while running. */
export const RUN_FAILED: RunResult = { ok: false, error: RUN_FAILED_ERROR };

/**
 * Loads the producer implementation (code-split) and the ports its params name (`preparePorts`,
 * docs/M3.md §2), then runs it with the synchronous `resolve`. A failed import becomes
 * `ui.lab.error.loadFailed`, an exception inside `run` `ui.lab.error.runFailed`.
 * Shared by the main thread and the producer worker.
 */
export async function runProducer<P>(producer: PrimitiveManifest<P>, params: P, producers: ProducerLookup = producerRegistry): Promise<RunResult> {
  const loaded = await Promise.all([producer.load(), preparePorts(producer, params, producers)]).catch(() => undefined);
  if (loaded === undefined) return LOAD_FAILED;
  const [module, resolve] = loaded;
  try {
    return module.run(params, { resolve });
  } catch {
    return RUN_FAILED;
  }
}
