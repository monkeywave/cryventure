import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STEP_DURATION, fallbackChoreography } from '@cryventure/core';
import { createChoreographyResolver } from '../choreography/resolveChoreography.ts';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createManualScheduler } from '../testing/manualScheduler.ts';
import { createLabStore } from './createLabStore.ts';
import { LabProvider } from './LabContext.tsx';
import { PLAYBACK_BASE_INTERVAL_MS, playbackIntervalMs, stepDurationMs, usePlayback } from './usePlayback.ts';

function setup() {
  const store = createLabStore(createFixtureBundle());
  const scheduler = createManualScheduler();
  const wrapper = ({ children }: { children: ReactNode }) => <LabProvider store={store}>{children}</LabProvider>;
  const hook = renderHook(() => usePlayback({ scheduler }), { wrapper });
  const progress = () => store.getState().progress.get();
  return { store, scheduler, hook, progress };
}

describe('playbackIntervalMs', () => {
  it('scales the base interval inversely with speed', () => {
    expect(playbackIntervalMs(1)).toBe(PLAYBACK_BASE_INTERVAL_MS);
    expect(playbackIntervalMs(2, 1000)).toBe(500);
  });
});

describe('stepDurationMs', () => {
  const resolver = createChoreographyResolver();

  it('uses the fixed base interval in debugger mode', () => {
    const state = createLabStore(createFixtureBundle()).getState();
    expect(stepDurationMs({ ...state, mode: 'debugger', speed: 1 }, resolver)).toBe(PLAYBACK_BASE_INTERVAL_MS);
    expect(stepDurationMs({ ...state, mode: 'debugger', speed: 2 }, resolver, 1000)).toBe(500);
  });

  it("uses the choreography's duration in story mode", () => {
    const state = createLabStore(createFixtureBundle()).getState();
    expect(stepDurationMs({ ...state, mode: 'story', step: 0, speed: 1 }, resolver)).toBe(DEFAULT_STEP_DURATION * 1000);
    expect(stepDurationMs({ ...state, mode: 'story', step: 0, speed: 2 }, resolver)).toBe((DEFAULT_STEP_DURATION * 1000) / 2);
    const slow = createChoreographyResolver({ choreograph: (context) => ({ ...fallbackChoreography(context), duration: 3 }) });
    expect(stepDurationMs({ ...state, mode: 'story', step: 1, speed: 2 }, slow)).toBe(1500);
  });

  it('falls back to the default duration at the initial state', () => {
    const state = createLabStore(createFixtureBundle()).getState();
    expect(stepDurationMs({ ...state, mode: 'story', step: -1, speed: 1 }, resolver)).toBe(DEFAULT_STEP_DURATION * 1000);
  });
});

describe('usePlayback', () => {
  it('does nothing while paused', () => {
    const { store, scheduler, progress } = setup();
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS * 5));
    expect(store.getState().step).toBe(-1);
    expect(progress()).toBe(1);
    expect(scheduler.pending()).toBe(0);
  });

  it('starts step 0 immediately and ticks once its progress reaches 1', () => {
    const { store, scheduler, progress } = setup();
    act(() => store.getState().play());
    expect(store.getState()).toMatchObject({ step: 0, transition: 'advance', playing: true });
    expect(progress()).toBe(0);

    const seen: number[] = [];
    const unsubscribe = store.getState().progress.on('change', (value) => seen.push(value));
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS / 2));
    expect(store.getState().step).toBe(0);
    expect(progress()).toBeCloseTo(0.5, 1);

    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS / 2));
    unsubscribe();
    expect(seen).toContain(1);
    expect(store.getState()).toMatchObject({ step: 1, transition: 'advance', playing: true });
    expect(progress()).toBe(0);
  });

  it('stops at the end with the last step fully shown', () => {
    const { store, scheduler, progress } = setup();
    act(() => store.getState().play());
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS * 10));
    expect(store.getState()).toMatchObject({ step: 2, playing: false });
    expect(progress()).toBe(1);
    expect(scheduler.pending()).toBe(0);
  });

  it('honours speed', () => {
    const { store, scheduler } = setup();
    act(() => {
      store.getState().setSpeed(2);
      store.getState().play();
    });
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS));
    expect(store.getState().step).toBe(2);
  });

  it('pause freezes progress mid-step', () => {
    const { store, scheduler, progress } = setup();
    act(() => store.getState().play());
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS / 2));
    act(() => store.getState().pause());
    const frozen = progress();
    expect(frozen).toBeGreaterThan(0);
    expect(frozen).toBeLessThan(1);
    expect(store.getState()).toMatchObject({ step: 0, transition: 'hold', playing: false });
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS * 2));
    expect(progress()).toBe(frozen);
    expect(store.getState().step).toBe(0);
  });

  // KNOWN SOURCE BUG (see report): createLabStore's syncProgress resets progress to 0 on the
  // hold → advance transition, so resuming restarts the step instead of continuing from the frozen value.
  it('play resumes a paused step from where it froze', () => {
    const { store, scheduler, progress } = setup();
    act(() => store.getState().play());
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS / 2));
    act(() => store.getState().pause());
    const frozen = progress();
    act(() => store.getState().play());
    expect(store.getState()).toMatchObject({ step: 0, transition: 'advance', playing: true });
    expect(progress()).toBe(frozen);
    act(() => scheduler.advance(Math.ceil(PLAYBACK_BASE_INTERVAL_MS * (1 - frozen)) + 16));
    expect(store.getState().step).toBe(1);
  });

  it('stops animating on unmount', () => {
    const { store, scheduler, hook, progress } = setup();
    act(() => store.getState().play());
    hook.unmount();
    act(() => scheduler.advance(PLAYBACK_BASE_INTERVAL_MS * 3));
    expect(store.getState().step).toBe(0);
    expect(progress()).toBe(0);
    expect(scheduler.pending()).toBe(0);
  });
});
