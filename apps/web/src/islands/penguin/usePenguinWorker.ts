import { useCallback, useEffect, useRef, useState } from 'react';
import { i18nRef, type I18nRef } from '@cryventure/core';
import type { PenguinMode, PenguinRequest, PenguinResponse } from './penguinJob.ts';
import type { Size } from './pixels.ts';

export interface PenguinResult extends Size {
  mode: PenguinMode;
  ciphertext: Uint8Array;
}

export type PenguinJobState = { status: 'idle' } | { status: 'busy'; mode: PenguinMode } | { status: 'done'; result: PenguinResult } | { status: 'error'; error: I18nRef };

export type PenguinJob = Omit<PenguinRequest, 'id'> & Size;

/** Builds the module worker; injectable so the hook can be tested without a real worker. */
export type WorkerFactory = () => Worker;

const createPenguinWorker: WorkerFactory = () => new Worker(new URL('./penguin.worker.ts', import.meta.url), { type: 'module' });

/**
 * Runs one encryption job at a time in a fresh module worker. Starting a job terminates the
 * previous worker, so a superseded job can neither finish late nor keep the CPU busy.
 */
export function usePenguinWorker(createWorker: WorkerFactory = createPenguinWorker) {
  const [state, setState] = useState<PenguinJobState>({ status: 'idle' });
  const workerRef = useRef<Worker | undefined>(undefined);
  const jobIdRef = useRef(0);

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = undefined;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (job: PenguinJob) => {
      stop();
      const id = ++jobIdRef.current;
      const { width, height, ...request } = job;
      const worker = createWorker();
      workerRef.current = worker;
      setState({ status: 'busy', mode: job.mode });
      worker.onmessage = (event: MessageEvent<PenguinResponse>) => {
        if (event.data.id !== jobIdRef.current) return;
        stop();
        setState(event.data.ok ? { status: 'done', result: { mode: job.mode, ciphertext: event.data.ciphertext, width, height } } : { status: 'error', error: event.data.error });
      };
      worker.onerror = () => {
        if (id !== jobIdRef.current) return;
        stop();
        setState({ status: 'error', error: i18nRef('ui.penguin.error.encryptFailed') });
      };
      worker.postMessage({ id, ...request } satisfies PenguinRequest, [request.rgb.buffer]);
    },
    [createWorker, stop],
  );

  const reset = useCallback(() => {
    stop();
    jobIdRef.current++;
    setState({ status: 'idle' });
  }, [stop]);

  return { state, start, reset };
}
