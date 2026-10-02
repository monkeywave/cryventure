import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createLabStore } from './createLabStore.ts';
import { LabProvider } from './LabContext.tsx';
import { PLAYBACK_BASE_INTERVAL_MS, playbackIntervalMs, usePlayback } from './usePlayback.ts';

function setup() {
  const store = createLabStore(createFixtureBundle());
  const wrapper = ({ children }: { children: ReactNode }) => <LabProvider store={store}>{children}</LabProvider>;
  const hook = renderHook(() => usePlayback(), { wrapper });
  return { store, hook };
}

describe('playbackIntervalMs', () => {
  it('scales the base interval inversely with speed', () => {
    expect(playbackIntervalMs(1)).toBe(PLAYBACK_BASE_INTERVAL_MS);
    expect(playbackIntervalMs(2, 1000)).toBe(500);
  });
});

describe('usePlayback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing while paused', () => {
    const { store } = setup();
    act(() => vi.advanceTimersByTime(PLAYBACK_BASE_INTERVAL_MS * 5));
    expect(store.getState().step).toBe(-1);
  });

  it('advances one step per interval and stops at the end', () => {
    const { store } = setup();
    act(() => store.getState().play());
    act(() => vi.advanceTimersByTime(PLAYBACK_BASE_INTERVAL_MS));
    expect(store.getState().step).toBe(0);
    act(() => vi.advanceTimersByTime(PLAYBACK_BASE_INTERVAL_MS * 10));
    expect(store.getState()).toMatchObject({ step: 2, playing: false });
  });

  it('honours speed', () => {
    const { store } = setup();
    act(() => {
      store.getState().setSpeed(2);
      store.getState().play();
    });
    act(() => vi.advanceTimersByTime(PLAYBACK_BASE_INTERVAL_MS));
    expect(store.getState().step).toBe(1);
  });

  it('stops ticking on pause and unmount', () => {
    const { store, hook } = setup();
    act(() => store.getState().play());
    act(() => store.getState().pause());
    act(() => vi.advanceTimersByTime(PLAYBACK_BASE_INTERVAL_MS * 2));
    expect(store.getState().step).toBe(-1);
    act(() => store.getState().play());
    hook.unmount();
    vi.advanceTimersByTime(PLAYBACK_BASE_INTERVAL_MS * 2);
    expect(store.getState().step).toBe(-1);
  });
});
