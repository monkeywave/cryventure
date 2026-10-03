import type { RunWorker } from './workerRun.ts';

/** In-memory stand-in for a module worker (jsdom has no Worker): records requests; the test decides when and how it answers. */
export class FakeWorker<Request = unknown> implements RunWorker<Request> {
  onmessage: RunWorker<Request>['onmessage'] = null;
  onerror: RunWorker<Request>['onerror'] = null;
  onmessageerror: RunWorker<Request>['onmessageerror'] = null;
  requests: Request[] = [];
  transfers: Transferable[][] = [];
  terminated = false;

  postMessage(request: Request, transfer: Transferable[] = []): void {
    this.requests.push(request);
    this.transfers.push(transfer);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(data: unknown): void {
    this.onmessage?.({ data });
  }

  /** A worker error (e.g. its chunk failed to load); returns whether the default handling was prevented. */
  fail(): boolean {
    let prevented = false;
    this.onerror?.({ preventDefault: () => (prevented = true) });
    return prevented;
  }
}

/** A worker factory that records every fake worker it creates. */
export function fakeWorkers<Request = unknown>() {
  const workers: FakeWorker<Request>[] = [];
  const factory = (): FakeWorker<Request> => {
    const worker = new FakeWorker<Request>();
    workers.push(worker);
    return worker;
  };
  const last = (): FakeWorker<Request> => {
    const worker = workers.at(-1);
    if (worker === undefined) throw new Error('no FakeWorker created');
    return worker;
  };
  return { workers, factory, last };
}
