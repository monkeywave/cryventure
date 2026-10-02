// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChoreographyModule } from '@cryventure/core';
import { loadChoreographyModule, useChoreographyModule } from './useChoreographyModule.ts';

const moduleA: ChoreographyModule = { choreograph: () => undefined };
const moduleB: ChoreographyModule = { choreograph: () => undefined };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('loadChoreographyModule', () => {
  it('resolves the loaded module', async () => {
    await expect(loadChoreographyModule({ loadChoreography: async () => moduleA })).resolves.toBe(moduleA);
  });

  it('resolves undefined without a loader', async () => {
    await expect(loadChoreographyModule({})).resolves.toBeUndefined();
  });

  it('resolves undefined when the import rejects', async () => {
    await expect(loadChoreographyModule({ loadChoreography: () => Promise.reject(new Error('chunk failed')) })).resolves.toBeUndefined();
  });
});

describe('useChoreographyModule', () => {
  it('is undefined until the module loads, then returns it', async () => {
    const pending = deferred<ChoreographyModule>();
    const loadChoreography = vi.fn(() => pending.promise);
    const producer = { loadChoreography };
    const { result } = renderHook(() => useChoreographyModule(producer));
    expect(result.current).toBeUndefined();
    await act(async () => pending.resolve(moduleA));
    expect(result.current).toBe(moduleA);
    expect(loadChoreography).toHaveBeenCalledTimes(1);
  });

  it('stays undefined without loadChoreography', async () => {
    const producer = {};
    const { result } = renderHook(() => useChoreographyModule(producer));
    await act(async () => {});
    expect(result.current).toBeUndefined();
  });

  it('stays undefined when the import rejects', async () => {
    const producer = { loadChoreography: () => Promise.reject(new Error('chunk failed')) };
    const { result } = renderHook(() => useChoreographyModule(producer));
    await act(async () => {});
    expect(result.current).toBeUndefined();
  });

  it('ignores a stale producer and only returns the current producer module', async () => {
    const slow = deferred<ChoreographyModule>();
    const fast = deferred<ChoreographyModule>();
    const producerA = { loadChoreography: () => slow.promise };
    const producerB = { loadChoreography: () => fast.promise };
    const { result, rerender } = renderHook(({ producer }) => useChoreographyModule(producer), { initialProps: { producer: producerA } });
    rerender({ producer: producerB });
    expect(result.current).toBeUndefined();
    await act(async () => slow.resolve(moduleA));
    expect(result.current).toBeUndefined();
    await act(async () => fast.resolve(moduleB));
    await waitFor(() => expect(result.current).toBe(moduleB));
  });

  it('drops the previous module immediately when the producer changes', async () => {
    const producerA = { loadChoreography: async () => moduleA };
    const pendingB = deferred<ChoreographyModule>();
    const producerB = { loadChoreography: () => pendingB.promise };
    const { result, rerender } = renderHook(({ producer }) => useChoreographyModule(producer), { initialProps: { producer: producerA } });
    await waitFor(() => expect(result.current).toBe(moduleA));
    rerender({ producer: producerB });
    expect(result.current).toBeUndefined();
    await act(async () => pendingB.resolve(moduleB));
    expect(result.current).toBe(moduleB);
  });
});
