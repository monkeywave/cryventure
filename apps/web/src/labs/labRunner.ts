import { i18nRef, type PrimitiveManifest, type ProducerLookup, type RunResult } from '@cryventure/core';
import { producerRegistry } from './producers.ts';
import { LOAD_FAILED, runProducer } from './runProducer.ts';
import { readRunResponse, type WorkerRunRequest } from './workerProtocol.ts';

/** The parts of a `Worker` the runner uses (a fake in tests). */
export interface ProducerWorker {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { preventDefault(): void }) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: WorkerRunRequest): void;
  terminate(): void;
}

export type ProducerWorkerFactory = () => ProducerWorker;

/** The run error for a worker that never answered (e.g. it hung or its reply was lost). */
export const TIMED_OUT: RunResult = { ok: false, error: i18nRef('ui.lab.error.timedOut') };

/** How long a worker run may take before it is terminated: generous, since a run normally takes milliseconds. */
export const DEFAULT_WORKER_TIMEOUT_MS = 30_000;

export interface LabRunnerOptions {
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
  new Worker(new URL('./producer.worker.ts', import.meta.url), { type: 'module' }) as unknown as ProducerWorker;

/** One run in a fresh worker; `cancel` terminates it and settles the run as a failed load; no answer within `timeoutMs` settles it as timed out. */
function startWorkerRun(createWorker: ProducerWorkerFactory, request: WorkerRunRequest, timeoutMs: number): { result: Promise<RunResult>; cancel: () => void } {
  let finish: (result: RunResult) => void = () => undefined;
  const result = new Promise<RunResult>((resolve) => (finish = resolve));
  let worker: ProducerWorker;
  try {
    worker = createWorker();
  } catch {
    finish(LOAD_FAILED);
    return { result, cancel: () => undefined };
  }
  const settle = (outcome: RunResult) => {
    clearTimeout(timeout);
    worker.terminate();
    finish(outcome);
  };
  worker.onmessage = (event) => settle(readRunResponse(event.data));
  worker.onerror = (event) => {
    event.preventDefault();
    settle(LOAD_FAILED);
  };
  worker.onmessageerror = () => settle(LOAD_FAILED);
  const timeout = setTimeout(() => settle(TIMED_OUT), timeoutMs);
  try {
    worker.postMessage(request);
  } catch {
    settle(LOAD_FAILED);
  }
  return { result, cancel: () => settle(LOAD_FAILED) };
}

export function createLabRunner(createWorker: ProducerWorkerFactory = createProducerWorker, producers: ProducerLookup = producerRegistry, { timeoutMs = DEFAULT_WORKER_TIMEOUT_MS }: LabRunnerOptions = {}): LabRunner {
  let cancelActive: () => void = () => undefined;
  const supersede = () => {
    cancelActive();
    cancelActive = () => undefined;
  };
  return {
    run(producer, params) {
      supersede();
      if (producer.runIn !== 'worker') return runProducer(producer, params, producers);
      const { result, cancel } = startWorkerRun(createWorker, { producerId: producer.id, params }, timeoutMs);
      cancelActive = cancel;
      return result;
    },
    dispose: supersede,
  };
}
