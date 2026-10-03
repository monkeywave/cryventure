import { i18nRef, type PrimitiveManifest, type ProducerLookup, type RunResult } from '@cryventure/core';
import { producerRegistry } from './producers.ts';
import { LOAD_FAILED, runProducer } from './runProducer.ts';
import { readRunResponse, type WorkerRunRequest } from './workerProtocol.ts';
import { DEFAULT_WORKER_TIMEOUT_MS, startWorkerRun, type RunWorker, type RunWorkerFactory, type WorkerRunOutcome } from './workerRun.ts';

/** The worker a producer run uses (a fake in tests). */
export type ProducerWorkerFactory = RunWorkerFactory<WorkerRunRequest>;

/** The run error for a worker that never answered (e.g. it hung or its reply was lost). */
export const TIMED_OUT: RunResult = { ok: false, error: i18nRef('ui.lab.error.timedOut') };

export interface LabRunnerOptions {
  /** Builds the worker for `runIn: 'worker'` producers (default: `producer.worker.ts`). */
  createWorker?: ProducerWorkerFactory;
  /** Where producers and their ports are looked up on the main thread (default: the app's producer registry). */
  producers?: ProducerLookup;
  /** Worker runs that have not answered after this many milliseconds settle as `TIMED_OUT`. */
  timeoutMs?: number;
}

/**
 * Runs one lab's producer: on the main thread, or in a module Web Worker for `runIn: 'worker'`
 * (docs/M3.md §8). Each run supersedes the previous one: a worker still busy with it is terminated
 * and its run settles as a failed load, which the caller drops as superseded (`IsCurrentRun`).
 */
export interface LabRunner {
  run<P>(producer: PrimitiveManifest<P>, params: P): Promise<RunResult>;
  /** Terminates a worker still running (the lab unmounts). */
  dispose(): void;
}

/** The browser's module worker for `producer.worker.ts` (bundled by Vite from this URL pattern). */
export const createProducerWorker: ProducerWorkerFactory = () =>
  new Worker(new URL('./producer.worker.ts', import.meta.url), { type: 'module' }) as unknown as RunWorker<WorkerRunRequest>;

/** A worker run's outcome as a run result: a cancelled (superseded) run settles as a failed load. */
function toRunResult(outcome: WorkerRunOutcome<unknown>): RunResult {
  if (outcome.ok) return readRunResponse(outcome.data);
  return outcome.reason === 'timedOut' ? TIMED_OUT : LOAD_FAILED;
}

export function createLabRunner({ createWorker = createProducerWorker, producers = producerRegistry, timeoutMs = DEFAULT_WORKER_TIMEOUT_MS }: LabRunnerOptions = {}): LabRunner {
  let cancelActive: () => void = () => undefined;
  const supersede = () => {
    cancelActive();
    cancelActive = () => undefined;
  };
  return {
    run(producer, params) {
      supersede();
      if (producer.runIn !== 'worker') return runProducer(producer, params, producers);
      const { outcome, cancel } = startWorkerRun<WorkerRunRequest, unknown>(createWorker, { producerId: producer.id, params }, { timeoutMs });
      cancelActive = cancel;
      return outcome.then(toRunResult);
    },
    dispose: supersede,
  };
}
