import type { PenguinRequest, PenguinResponse } from './penguinJob.ts';

/** In-memory stand-in for the penguin module worker (jsdom has no Worker). */
export class FakeWorker {
  static created: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<PenguinResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: PenguinRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.created.push(this);
  }

  postMessage(request: PenguinRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: PenguinResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<PenguinResponse>);
  }

  fail(): void {
    this.onerror?.({} as ErrorEvent);
  }

  static factory = (): Worker => new FakeWorker() as unknown as Worker;

  static last(): FakeWorker {
    const worker = FakeWorker.created.at(-1);
    if (worker === undefined) throw new Error('no FakeWorker created');
    return worker;
  }
}
