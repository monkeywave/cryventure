// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeWorkers } from '../../labs/fakeWorker.testing.ts';
import type { PenguinRequest } from './penguinJob.ts';
import { usePenguinWorker, type PenguinJob } from './usePenguinWorker.ts';

const job = (overrides: Partial<PenguinJob> = {}): PenguinJob => ({
  mode: 'ecb',
  key: new Uint8Array(16),
  iv: new Uint8Array(16),
  rgb: new Uint8Array(6),
  width: 2,
  height: 1,
  ...overrides,
});

let fakes = fakeWorkers<PenguinRequest>();

function setup() {
  return renderHook(() => usePenguinWorker(fakes.factory));
}

beforeEach(() => {
  fakes = fakeWorkers<PenguinRequest>();
});

describe('usePenguinWorker', () => {
  it('posts the job, transferring its pixels, and reports busy, then done with the image size', async () => {
    const { result } = setup();
    const cbcJob = job({ mode: 'cbc' });
    act(() => result.current.start(cbcJob));
    expect(result.current.state).toEqual({ status: 'busy', mode: 'cbc' });
    const worker = fakes.last();
    expect(worker.requests[0]).toMatchObject({ mode: 'cbc' });
    expect(worker.requests[0]).not.toHaveProperty('width');
    expect(worker.transfers[0]).toEqual([cbcJob.rgb.buffer]);
    const ciphertext = new Uint8Array(16).fill(9);
    await act(async () => worker.respond({ ok: true, ciphertext }));
    expect(result.current.state).toEqual({ status: 'done', result: { mode: 'cbc', ciphertext, width: 2, height: 1 } });
    expect(worker.terminated).toBe(true);
  });

  it('terminates a superseded worker and ignores its late answer', async () => {
    const { result } = setup();
    act(() => result.current.start(job()));
    const first = fakes.last();
    act(() => result.current.start(job({ mode: 'cbc' })));
    expect(first.terminated).toBe(true);
    await act(async () => first.respond({ ok: true, ciphertext: new Uint8Array(16) }));
    expect(result.current.state).toEqual({ status: 'busy', mode: 'cbc' });
  });

  it('reports a run error, a crashed worker and an unreadable answer', async () => {
    const { result } = setup();
    act(() => result.current.start(job()));
    await act(async () => fakes.last().respond({ ok: false, error: { key: 'core.error.keyLength', params: { sizes: '16' } } }));
    expect(result.current.state).toEqual({ status: 'error', error: { key: 'core.error.keyLength', params: { sizes: '16' } } });
    act(() => result.current.start(job()));
    await act(async () => fakes.last().fail());
    expect(result.current.state).toEqual({ status: 'error', error: { key: 'ui.penguin.error.encryptFailed' } });
    act(() => result.current.start(job()));
    await act(async () => fakes.last().onmessageerror?.({}));
    expect(result.current.state).toEqual({ status: 'error', error: { key: 'ui.penguin.error.encryptFailed' } });
  });

  it('stops a worker that never answers and reports the timeout', async () => {
    vi.useFakeTimers();
    try {
      const { result } = setup();
      act(() => result.current.start(job()));
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(fakes.last().terminated).toBe(true);
      expect(result.current.state).toEqual({ status: 'error', error: { key: 'ui.penguin.error.timedOut' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reset and unmount stop the running worker', () => {
    const { result, unmount } = setup();
    act(() => result.current.start(job()));
    act(() => result.current.reset());
    expect(fakes.last().terminated).toBe(true);
    expect(result.current.state).toEqual({ status: 'idle' });
    act(() => result.current.start(job()));
    unmount();
    expect(fakes.last().terminated).toBe(true);
  });
});
