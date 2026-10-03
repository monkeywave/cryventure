import { useCallback, useEffect, useRef, useState } from 'react';
import { i18nRef, type I18nRef } from '@cryventure/core';
import { DEFAULT_WORKER_TIMEOUT_MS, startWorkerRun, type RunWorker, type RunWorkerFactory, type WorkerRun, type WorkerRunOutcome } from '../../labs/workerRun.ts';
import type { PenguinMode, PenguinRequest, PenguinResponse } from './penguinJob.ts';
import type { Size } from './pixels.ts';

export interface PenguinResult extends Size {
  mode: PenguinMode;
  ciphertext: Uint8Array;
}

export type PenguinJobState = { status: 'idle' } | { status: 'busy'; mode: PenguinMode } | { status: 'done'; result: PenguinResult } | { status: 'error'; error: I18nRef };

export type PenguinJob = PenguinRequest & Size;

/** Builds the module worker; injectable so the hook can be tested without a real worker. */
export type WorkerFactory = RunWorkerFactory<PenguinRequest>;

const createPenguinWorker: WorkerFactory = () => new Worker(new URL('./penguin.worker.ts', import.meta.url), { type: 'module' }) as unknown as RunWorker<PenguinRequest>;

const ENCRYPT_FAILED = i18nRef('ui.penguin.error.encryptFailed');
const TIMED_OUT = i18nRef('ui.penguin.error.timedOut');

/** The state a finished (not cancelled) run leads to. */
function settledState(outcome: WorkerRunOutcome<PenguinResponse>, { mode, width, height }: PenguinJob): PenguinJobState {
  if (!outcome.ok) return { status: 'error', error: outcome.reason === 'timedOut' ? TIMED_OUT : ENCRYPT_FAILED };
  const response = outcome.data;
  return response.ok ? { status: 'done', result: { mode, ciphertext: response.ciphertext, width, height } } : { status: 'error', error: response.error };
}

/**
 * Runs one encryption job at a time in a fresh module worker (`startWorkerRun`). Starting a job
 * terminates the previous worker, so a superseded job can neither finish late nor keep the CPU busy;
 * only the current run may update the state.
 */
export function usePenguinWorker(createWorker: WorkerFactory = createPenguinWorker) {
  const [state, setState] = useState<PenguinJobState>({ status: 'idle' });
  const currentRun = useRef<WorkerRun<PenguinResponse> | undefined>(undefined);

  const stop = useCallback(() => {
    currentRun.current?.cancel();
    currentRun.current = undefined;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (job: PenguinJob) => {
      stop();
      const { width: _width, height: _height, ...request } = job;
      const run = startWorkerRun<PenguinRequest, PenguinResponse>(createWorker, request, { transfer: [request.rgb.buffer], timeoutMs: DEFAULT_WORKER_TIMEOUT_MS });
      currentRun.current = run;
      setState({ status: 'busy', mode: job.mode });
      void run.outcome.then((outcome) => {
        if (currentRun.current !== run) return;
        currentRun.current = undefined;
        setState(settledState(outcome, job));
      });
    },
    [createWorker, stop],
  );

  const reset = useCallback(() => {
    stop();
    setState({ status: 'idle' });
  }, [stop]);

  return { state, start, reset };
}
