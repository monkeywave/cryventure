import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeWorkers } from './fakeWorker.testing.ts';
import { startWorkerRun } from './workerRun.ts';

const OPTIONS = { timeoutMs: 1000 };

afterEach(() => {
  vi.useRealTimers();
});

describe('startWorkerRun', () => {
  it('posts the request with its transfer list and settles with the answer, terminating the worker', async () => {
    const { last, factory } = fakeWorkers<{ n: number }>();
    const buffer = new ArrayBuffer(4);
    const run = startWorkerRun<{ n: number }, string>(factory, { n: 1 }, { ...OPTIONS, transfer: [buffer] });
    expect(last().requests).toEqual([{ n: 1 }]);
    expect(last().transfers).toEqual([[buffer]]);
    last().respond('answer');
    expect(await run.outcome).toEqual({ ok: true, data: 'answer' });
    expect(last().terminated).toBe(true);
  });

  it('settles as failed on a worker error (preventing its default report) and on a message that cannot be read', async () => {
    const { last, factory } = fakeWorkers();
    const crashed = startWorkerRun(factory, {}, OPTIONS);
    expect(last().fail()).toBe(true);
    expect(await crashed.outcome).toEqual({ ok: false, reason: 'failed' });
    const unreadable = startWorkerRun(factory, {}, OPTIONS);
    last().onmessageerror?.({});
    expect(await unreadable.outcome).toEqual({ ok: false, reason: 'failed' });
    expect(last().terminated).toBe(true);
  });

  it('settles as failed when no worker can be created', async () => {
    const run = startWorkerRun(() => {
      throw new Error('no workers');
    }, {}, OPTIONS);
    expect(await run.outcome).toEqual({ ok: false, reason: 'failed' });
  });

  it('settles as timed out after `timeoutMs`, and as cancelled on `cancel`', async () => {
    vi.useFakeTimers();
    const { last, factory } = fakeWorkers();
    const slow = startWorkerRun(factory, {}, OPTIONS);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await slow.outcome).toEqual({ ok: false, reason: 'timedOut' });
    expect(last().terminated).toBe(true);
    const cancelled = startWorkerRun(factory, {}, OPTIONS);
    cancelled.cancel();
    expect(await cancelled.outcome).toEqual({ ok: false, reason: 'cancelled' });
    expect(last().terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
