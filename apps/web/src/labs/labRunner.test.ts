import { describe, expect, it, vi } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { fakeWorkers, type FakeWorker } from './fakeWorker.testing.ts';
import { createLabRunner } from './labRunner.ts';
import { handleRunRequest, type WorkerRunRequest } from './workerProtocol.ts';
import { toyComposite, toyMemberComposite, toyMemberProducers, toyProducers } from './testProducers.ts';

const LOAD_FAILED = { ok: false, error: { key: 'ui.lab.error.loadFailed' } };
const inWorker = { ...toyComposite, runIn: 'worker' } as PrimitiveManifest;

/** Answers the worker's first request the way `producer.worker.ts` would, over the toy registry. */
async function answer(worker: FakeWorker<WorkerRunRequest> | undefined) {
  worker?.respond(await handleRunRequest(worker.requests[0], toyProducers));
}

describe('createLabRunner', () => {
  it('runs main-thread producers without a worker', async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const result = await createLabRunner({ createWorker: factory, producers: toyProducers }).run(toyComposite, { cipher: 'toy' });
    expect(result.ok).toBe(true);
    expect(workers).toHaveLength(0);
  });

  it("runs `runIn: 'worker'` producers in a worker and terminates it once answered", async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const pending = createLabRunner({ createWorker: factory, producers: toyProducers }).run(inWorker, { cipher: 'toy' });
    expect(workers[0]?.requests).toEqual([{ producerId: 'toy-mode', params: { cipher: 'toy' } }]);
    await answer(workers[0]);
    expect(await pending).toMatchObject({ ok: true, trace: { output: { cipher: [1] } } });
    expect(workers[0]?.terminated).toBe(true);
  });

  it('terminates a superseded worker run, which settles as a failed load', async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const runner = createLabRunner({ createWorker: factory, producers: toyProducers });
    const first = runner.run(inWorker, { cipher: 'toy' });
    const second = runner.run(inWorker, { cipher: 'toy' });
    expect(workers[0]?.terminated).toBe(true);
    expect(await first).toEqual(LOAD_FAILED);
    await answer(workers[1]);
    expect((await second).ok).toBe(true);
  });

  it('terminates every superseded worker run and answers only the latest', async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const runner = createLabRunner({ createWorker: factory, producers: toyProducers });
    const runs = [1, 2, 3].map(() => runner.run(inWorker, { cipher: 'toy' }));
    expect(workers.map((worker) => worker.terminated)).toEqual([true, true, false]);
    await answer(workers[2]);
    expect(await Promise.all(runs)).toMatchObject([LOAD_FAILED, LOAD_FAILED, { ok: true }]);
  });

  it('terminates a worker run superseded by a main-thread run', async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const runner = createLabRunner({ createWorker: factory, producers: toyProducers });
    const first = runner.run(inWorker, { cipher: 'toy' });
    expect((await runner.run(toyComposite, { cipher: 'toy' })).ok).toBe(true);
    expect(workers[0]?.terminated).toBe(true);
    expect(await first).toEqual(LOAD_FAILED);
  });

  it('runs a producer with a member port field in the worker', async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const kdfInWorker = { ...toyMemberComposite, runIn: 'worker' } as PrimitiveManifest;
    const pending = createLabRunner({ createWorker: factory, producers: toyMemberProducers }).run(kdfInWorker, { hash: 'toy-hash:toy-1' });
    workers[0]?.respond(await handleRunRequest(workers[0].requests[0], toyMemberProducers));
    expect(await pending).toMatchObject({ ok: true, trace: { output: { member: 'toy-1', digest: [3] } } });
  });

  it('turns a worker error (e.g. its chunk failed to load) into a failed load', async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const pending = createLabRunner({ createWorker: factory, producers: toyProducers }).run(inWorker, { cipher: 'toy' });
    expect(workers[0]?.fail()).toBe(true);
    expect(await pending).toEqual(LOAD_FAILED);
    expect(workers[0]?.terminated).toBe(true);
  });

  it('settles as a failed load when no worker can be created', async () => {
    const runner = createLabRunner({
      createWorker: () => {
        throw new Error('no workers');
      },
      producers: toyProducers,
    });
    expect(await runner.run(inWorker, { cipher: 'toy' })).toEqual(LOAD_FAILED);
  });

  it('settles a worker run that never answers as timed out and terminates the worker', async () => {
    vi.useFakeTimers();
    try {
      const { workers, factory } = fakeWorkers<WorkerRunRequest>();
      const pending = createLabRunner({ createWorker: factory, producers: toyProducers, timeoutMs: 1000 }).run(inWorker, { cipher: 'toy' });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await pending).toEqual({ ok: false, error: { key: 'ui.lab.error.timedOut' } });
      expect(workers[0]?.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to a generous 30 s timeout', async () => {
    vi.useFakeTimers();
    try {
      const { workers, factory } = fakeWorkers<WorkerRunRequest>();
      const pending = createLabRunner({ createWorker: factory, producers: toyProducers }).run(inWorker, { cipher: 'toy' });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(workers[0]?.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ ok: false, error: { key: 'ui.lab.error.timedOut' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the timeout once the worker answered', async () => {
    vi.useFakeTimers();
    try {
      const { workers, factory } = fakeWorkers<WorkerRunRequest>();
      const pending = createLabRunner({ createWorker: factory, producers: toyProducers, timeoutMs: 1000 }).run(inWorker, { cipher: 'toy' });
      await answer(workers[0]);
      expect((await pending).ok).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles as a failed load when the request cannot be posted', async () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const createWorker = () => {
      const worker = factory();
      worker.postMessage = () => {
        throw new Error('DataCloneError');
      };
      return worker;
    };
    const runner = createLabRunner({ createWorker, producers: toyProducers });
    expect(await runner.run(inWorker, { cipher: 'toy' })).toEqual(LOAD_FAILED);
    expect(workers[0]?.terminated).toBe(true);
  });

  it('dispose terminates a running worker', () => {
    const { workers, factory } = fakeWorkers<WorkerRunRequest>();
    const runner = createLabRunner({ createWorker: factory, producers: toyProducers });
    void runner.run(inWorker, { cipher: 'toy' });
    runner.dispose();
    expect(workers[0]?.terminated).toBe(true);
  });
});
