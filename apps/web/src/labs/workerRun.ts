/**
 * One request/response run in a fresh module Web Worker, shared by the lab runner and the PenguinLab:
 * the host posts one request, the worker answers once, and the host terminates it.
 */

/** The parts of a `Worker` a run uses (a fake in tests). */
export interface RunWorker<Request> {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { preventDefault(): void }) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: Request, transfer?: Transferable[]): void;
  terminate(): void;
}

export type RunWorkerFactory<Request> = () => RunWorker<Request>;

/** How long a worker run may take before it is terminated: generous, since a run normally takes milliseconds. */
export const DEFAULT_WORKER_TIMEOUT_MS = 30_000;

/**
 * How a run ended: the worker's answer (unchecked: the caller validates it), or why there is none:
 * `failed` (no worker, a worker error, an unreadable message or request), `timedOut`, or `cancelled`.
 */
export type WorkerRunOutcome<Response> = { ok: true; data: Response } | { ok: false; reason: 'failed' | 'timedOut' | 'cancelled' };

export interface WorkerRunOptions {
  /** Buffers moved to the worker instead of copied. */
  transfer?: Transferable[];
  /** A run that has not answered after this many milliseconds settles as `timedOut`. */
  timeoutMs: number;
}

export interface WorkerRun<Response> {
  outcome: Promise<WorkerRunOutcome<Response>>;
  /** Terminates the worker; the run settles as `cancelled` (no-op once settled). */
  cancel: () => void;
}

/** Starts one run; the worker is terminated as soon as the run settles, however it settles. */
export function startWorkerRun<Request, Response>(createWorker: RunWorkerFactory<Request>, request: Request, { transfer = [], timeoutMs }: WorkerRunOptions): WorkerRun<Response> {
  let finish: (outcome: WorkerRunOutcome<Response>) => void = () => undefined;
  const outcome = new Promise<WorkerRunOutcome<Response>>((resolve) => (finish = resolve));
  let worker: RunWorker<Request>;
  try {
    worker = createWorker();
  } catch {
    finish({ ok: false, reason: 'failed' });
    return { outcome, cancel: () => undefined };
  }
  const settle = (result: WorkerRunOutcome<Response>) => {
    clearTimeout(timeout);
    worker.terminate();
    finish(result);
  };
  const fail = () => settle({ ok: false, reason: 'failed' });
  worker.onmessage = (event) => settle({ ok: true, data: event.data as Response });
  worker.onerror = (event) => {
    event.preventDefault();
    fail();
  };
  worker.onmessageerror = fail;
  const timeout = setTimeout(() => settle({ ok: false, reason: 'timedOut' }), timeoutMs);
  try {
    worker.postMessage(request, transfer);
  } catch {
    fail();
  }
  return { outcome, cancel: () => settle({ ok: false, reason: 'cancelled' }) };
}
