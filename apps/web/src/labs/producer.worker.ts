/**
 * Module Web Worker for producers with `runIn: 'worker'` (docs/M3.md §8): imports the primitive
 * registry, prepares the ports, runs and posts the result back as JSON. The host starts one worker
 * per run and terminates it when the run settles or is superseded.
 */
import { producerRegistry } from './producers.ts';
import { handleRunRequest } from './workerProtocol.ts';

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  void handleRunRequest(event.data, producerRegistry).then((response) => scope.postMessage(response));
};
