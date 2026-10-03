import { describe, expect, it, vi } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { createLabRunner, type ProducerWorker } from './labRunner.ts';
import { handleRunRequest, type WorkerRunRequest } from './workerProtocol.ts';
import { toyComposite, toyProducers } from './testProducers.ts';

const LOAD_FAILED = { ok: false, error: { key: 'ui.lab.error.loadFailed' } };
const inWorker = { ...toyComposite, runIn: 'worker' } as PrimitiveManifest;

/** A fake worker that records requests; the test decides when (and how) it answers. */
class FakeWorker implements ProducerWorker {
  onmessage: ProducerWorker['onmessage'] = null;
  onerror: ProducerWorker['onerror'] = null;
  onmessageerror: ProducerWorker['onmessageerror'] = null;
  requests: WorkerRunRequest[] = [];
  terminated = false;
  postMessage(message: WorkerRunRequest) {
    this.requests.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  async answer() {
    this.onmessage?.({ data: await handleRunRequest(this.requests[0], toyProducers) });
  }
}

function fakeWorkers() {
  const workers: FakeWorker[] = [];
  const factory = vi.fn(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { workers, factory };
}

describe('createLabRunner', () => {
  it('runs main-thread producers without a worker', async () => {
    const { factory } = fakeWorkers();
    const result = await createLabRunner(factory, toyProducers).run(toyComposite, { cipher: 'toy' });
    expect(result.ok).toBe(true);
    expect(factory).not.toHaveBeenCalled();
  });

  it("runs `runIn: 'worker'` producers in a worker and terminates it once answered", async () => {
    const { workers, factory } = fakeWorkers();
    const pending = createLabRunner(factory, toyProducers).run(inWorker, { cipher: 'toy' });
    expect(workers[0]?.requests).toEqual([{ producerId: 'toy-mode', params: { cipher: 'toy' } }]);
    await workers[0]?.answer();
    expect(await pending).toMatchObject({ ok: true, trace: { output: { cipher: [1] } } });
    expect(workers[0]?.terminated).toBe(true);
  });

  it('terminates a superseded worker run, which settles as a failed load', async () => {
    const { workers, factory } = fakeWorkers();
    const runner = createLabRunner(factory, toyProducers);
    const first = runner.run(inWorker, { cipher: 'toy' });
    const second = runner.run(inWorker, { cipher: 'toy' });
    expect(workers[0]?.terminated).toBe(true);
    expect(await first).toEqual(LOAD_FAILED);
    await workers[1]?.answer();
    expect((await second).ok).toBe(true);
  });

  it('turns a worker error (e.g. its chunk failed to load) into a failed load', async () => {
    const { workers, factory } = fakeWorkers();
    const pending = createLabRunner(factory, toyProducers).run(inWorker, { cipher: 'toy' });
    const preventDefault = vi.fn();
    workers[0]?.onerror?.({ preventDefault });
    expect(await pending).toEqual(LOAD_FAILED);
    expect(preventDefault).toHaveBeenCalled();
    expect(workers[0]?.terminated).toBe(true);
  });

  it('settles as a failed load when no worker can be created', async () => {
    const runner = createLabRunner(() => {
      throw new Error('no workers');
    }, toyProducers);
    expect(await runner.run(inWorker, { cipher: 'toy' })).toEqual(LOAD_FAILED);
  });

  it('dispose terminates a running worker', () => {
    const { workers, factory } = fakeWorkers();
    const runner = createLabRunner(factory, toyProducers);
    void runner.run(inWorker, { cipher: 'toy' });
    runner.dispose();
    expect(workers[0]?.terminated).toBe(true);
  });
});
