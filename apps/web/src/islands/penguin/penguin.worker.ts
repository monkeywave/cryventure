import { producerRegistry } from '../../labs/producers.ts';
import { runPenguinJob, type PenguinRequest } from './penguinJob.ts';

/**
 * PenguinLab module worker: one job per message (the island starts a fresh worker per job and
 * terminates superseded ones). The ciphertext buffer is transferred, not copied.
 */

/** The part of `DedicatedWorkerGlobalScope` used here (the app's TS config has the DOM lib, not WebWorker). */
interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<PenguinRequest>) => void): void;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  void runPenguinJob(event.data, producerRegistry).then((response) => {
    scope.postMessage(response, response.ok ? [response.ciphertext.buffer] : []);
  });
});
