// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeWorker } from './fakeWorker.testing.ts';
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

function setup() {
  return renderHook(() => usePenguinWorker(FakeWorker.factory));
}

beforeEach(() => {
  FakeWorker.created = [];
});

describe('usePenguinWorker', () => {
  it('posts the job with an id and reports busy, then done with the image size', () => {
    const { result } = setup();
    act(() => result.current.start(job({ mode: 'cbc' })));
    expect(result.current.state).toEqual({ status: 'busy', mode: 'cbc' });
    const worker = FakeWorker.last();
    expect(worker.requests[0]).toMatchObject({ id: 1, mode: 'cbc' });
    expect(worker.requests[0]).not.toHaveProperty('width');
    const ciphertext = new Uint8Array(16).fill(9);
    act(() => worker.respond({ id: 1, ok: true, ciphertext }));
    expect(result.current.state).toEqual({ status: 'done', result: { mode: 'cbc', ciphertext, width: 2, height: 1 } });
    expect(worker.terminated).toBe(true);
  });

  it('terminates a superseded worker and ignores its late answer', () => {
    const { result } = setup();
    act(() => result.current.start(job()));
    const first = FakeWorker.last();
    act(() => result.current.start(job({ mode: 'cbc' })));
    expect(first.terminated).toBe(true);
    act(() => first.respond({ id: 1, ok: true, ciphertext: new Uint8Array(16) }));
    expect(result.current.state).toEqual({ status: 'busy', mode: 'cbc' });
  });

  it('reports a run error and a crashed worker', () => {
    const { result } = setup();
    act(() => result.current.start(job()));
    act(() => FakeWorker.last().respond({ id: 1, ok: false, error: { key: 'core.error.keyLength', params: { sizes: '16' } } }));
    expect(result.current.state).toEqual({ status: 'error', error: { key: 'core.error.keyLength', params: { sizes: '16' } } });
    act(() => result.current.start(job()));
    act(() => FakeWorker.last().fail());
    expect(result.current.state).toEqual({ status: 'error', error: { key: 'ui.penguin.error.encryptFailed' } });
  });

  it('reset and unmount stop the running worker', () => {
    const { result, unmount } = setup();
    act(() => result.current.start(job()));
    act(() => result.current.reset());
    expect(FakeWorker.last().terminated).toBe(true);
    expect(result.current.state).toEqual({ status: 'idle' });
    act(() => result.current.start(job()));
    unmount();
    expect(FakeWorker.last().terminated).toBe(true);
  });
});
