import { describe, expect, it } from 'vitest';
import { stateAt, type Snapshot } from '@cryventure/core';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createManualScheduler } from '../testing/manualScheduler.ts';
import { createLabStore } from './createLabStore.ts';
import type { LabMode } from './labReducers.ts';
import { createPlaybackDriver } from './playbackDriver.ts';
import { stateFacetOf, type AnyStateFacet } from './stateSteps.ts';

const STEP_MS = 160;

function setup({ mode = 'story', reducedMotion = false, scaleBySpeed = false }: { mode?: LabMode; reducedMotion?: boolean; scaleBySpeed?: boolean } = {}) {
  const bundle = createFixtureBundle();
  const store = createLabStore(bundle);
  store.getState().setMode(mode);
  const scheduler = createManualScheduler();
  const dispose = createPlaybackDriver({ store, scheduler, stepDurationMs: (state) => (scaleBySpeed ? STEP_MS / state.speed : STEP_MS), reducedMotion: () => reducedMotion });
  const facet = stateFacetOf(bundle) as AnyStateFacet;
  const progress = () => store.getState().progress.get();
  return { store, scheduler, dispose, facet, progress };
}

interface PlayheadView {
  step: number;
  progress: number;
  snapshot: Snapshot<string>;
}

const viewOf = (facet: AnyStateFacet, step: number, progress: number): PlayheadView => ({ step, progress, snapshot: stateAt(facet, step) });

describe('createPlaybackDriver', () => {
  it('animates progress 0 → 1 for a story-mode next()', () => {
    const { store, scheduler, progress } = setup();
    store.getState().next();
    expect(store.getState()).toMatchObject({ step: 0, transition: 'advance' });
    expect(progress()).toBe(0);
    scheduler.advance(STEP_MS / 2);
    expect(progress()).toBeCloseTo(0.5, 5);
    scheduler.advance(STEP_MS / 2);
    expect(progress()).toBe(1);
    expect(store.getState().step).toBe(0);
    expect(scheduler.pending()).toBe(0);
  });

  it('jumps without animating in debugger mode', () => {
    const { store, scheduler, progress } = setup({ mode: 'debugger' });
    store.getState().next();
    expect(store.getState()).toMatchObject({ step: 0, transition: 'jump' });
    expect(progress()).toBe(1);
    expect(scheduler.pending()).toBe(0);
  });

  it('with reduced motion, jumps progress to 1 immediately and only dwells while playing', () => {
    const { store, scheduler, progress } = setup({ reducedMotion: true });
    store.getState().next();
    expect(progress()).toBe(1);
    expect(scheduler.pending()).toBe(0);

    store.getState().first();
    store.getState().play();
    expect(store.getState().step).toBe(0);
    expect(progress()).toBe(1);
    scheduler.advance(STEP_MS - 16);
    expect(store.getState().step).toBe(0);
    scheduler.advance(16);
    expect(store.getState().step).toBe(1);
    expect(progress()).toBe(1);
    scheduler.advance(STEP_MS * 5);
    expect(store.getState()).toMatchObject({ step: 2, playing: false });
  });

  describe('reduced-motion dwell survives driver restarts', () => {
    function dwellingOnStep0() {
      const lab = setup({ reducedMotion: true, scaleBySpeed: true });
      lab.store.getState().first();
      lab.store.getState().play();
      lab.scheduler.advance(STEP_MS / 2);
      expect(lab.store.getState()).toMatchObject({ step: 0, playing: true });
      return lab;
    }

    it('a speed change mid-dwell does not skip the step and rescales the remaining dwell', () => {
      const { store, scheduler } = dwellingOnStep0();
      store.getState().setSpeed(2);
      expect(store.getState().step).toBe(0);
      // Half of the dwell remains: STEP_MS / 2 at 1× is STEP_MS / 4 at 2×.
      scheduler.advance(STEP_MS / 4 - 16);
      expect(store.getState().step).toBe(0);
      scheduler.advance(16);
      expect(store.getState().step).toBe(1);
    });

    it('a mode change mid-dwell resumes the remaining dwell', () => {
      const { store, scheduler } = dwellingOnStep0();
      store.getState().setMode('debugger');
      expect(store.getState().step).toBe(0);
      scheduler.advance(STEP_MS / 2 - 16);
      expect(store.getState().step).toBe(0);
      scheduler.advance(16);
      expect(store.getState().step).toBe(1);
    });

    it('pause and resume mid-dwell continues the remaining dwell', () => {
      const { store, scheduler } = dwellingOnStep0();
      store.getState().pause();
      scheduler.advance(STEP_MS * 5);
      store.getState().play();
      expect(store.getState().step).toBe(0);
      scheduler.advance(STEP_MS / 2);
      expect(store.getState().step).toBe(1);
    });
  });

  it('stops debugger playback on a breakpoint, with that step fully shown', () => {
    const { store, scheduler, progress } = setup({ mode: 'debugger' });
    store.getState().toggleBreakpoint('sub');
    store.getState().play();
    scheduler.advance(STEP_MS * 10);
    expect(store.getState()).toMatchObject({ step: 1, playing: false });
    expect(progress()).toBe(1);
  });

  it('ignores breakpoints in story mode', () => {
    const { store, scheduler } = setup({ mode: 'story' });
    store.getState().toggleBreakpoint('sub');
    store.getState().play();
    scheduler.advance(STEP_MS * 10);
    expect(store.getState()).toMatchObject({ step: 2, playing: false });
  });

  it.each([0, 1, 2])('playing from the start until step %i completes equals seek(%i)', (target) => {
    const { store, scheduler, facet } = setup();
    let played: PlayheadView | undefined;
    const unsubscribe = store.getState().progress.on('change', (value) => {
      const { step } = store.getState();
      if (played === undefined && step === target && value === 1) played = viewOf(facet, step, value);
    });
    store.getState().play();
    scheduler.advance(STEP_MS * 10);
    unsubscribe();

    const sought = setup();
    sought.store.getState().seek(target);
    expect(played).toEqual(viewOf(sought.facet, sought.store.getState().step, sought.progress()));
    expect(played).toMatchObject({ step: target, progress: 1 });
  });

  it('prev() after an animated step shows exactly the end state of the previous step', () => {
    const { store, scheduler, progress } = setup();
    store.getState().next();
    scheduler.advance(STEP_MS);
    store.getState().next();
    scheduler.advance(STEP_MS / 2);
    expect(progress()).toBeLessThan(1);

    store.getState().prev();
    expect(store.getState()).toMatchObject({ step: 0, transition: 'jump' });
    expect(progress()).toBe(1);
    scheduler.advance(STEP_MS * 2);
    expect(store.getState().step).toBe(0);
    expect(progress()).toBe(1);
  });

  it('stops driving after dispose', () => {
    const { store, scheduler, dispose, progress } = setup();
    store.getState().play();
    dispose();
    scheduler.advance(STEP_MS * 5);
    expect(store.getState().step).toBe(0);
    expect(progress()).toBe(0);
    expect(scheduler.pending()).toBe(0);
  });
});
