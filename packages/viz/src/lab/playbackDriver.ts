import type { LabState, LabStore } from './createLabStore.ts';
import { runTimed, type FrameScheduler } from './frameScheduler.ts';

export interface PlaybackDriverOptions {
  store: LabStore;
  scheduler: FrameScheduler;
  /** Wall-clock length of the current step at the current speed. */
  stepDurationMs: (state: LabState) => number;
  /** Reduced motion: no tweening; steps jump to their end state and playback only dwells. */
  reducedMotion: () => boolean;
}

function relevantChange(state: LabState, previous: LabState): boolean {
  return (
    state.step !== previous.step ||
    state.transition !== previous.transition ||
    state.playing !== previous.playing ||
    state.speed !== previous.speed ||
    state.mode !== previous.mode ||
    state.bundle !== previous.bundle
  );
}

/**
 * Drives the continuous playhead: an `advance` step animates `progress` linearly to 1 over its
 * duration; while playing, a finished step ticks to the next one. Returns a dispose function.
 * Choreographies apply their own easing, so the playhead itself stays linear (and seeks stay exact).
 */
export function createPlaybackDriver({ store, scheduler, stepDurationMs, reducedMotion }: PlaybackDriverOptions): () => void {
  let cancel: (() => void) | undefined;
  const stop = () => {
    cancel?.();
    cancel = undefined;
  };
  const finish = () => {
    cancel = undefined;
    if (store.getState().playing) store.getState().tick();
  };

  const animate = (state: LabState, from: number, durationMs: number) => {
    if (reducedMotion()) {
      state.progress.set(1);
      if (state.playing) cancel = runTimed(scheduler, durationMs, () => {}, finish);
      return;
    }
    cancel = runTimed(scheduler, durationMs * (1 - from), (fraction) => state.progress.set(from + (1 - from) * fraction), finish);
  };

  const sync = () => {
    stop();
    const state = store.getState();
    const progress = state.progress.get();
    if (progress < 1 && state.transition === 'advance') animate(state, progress, stepDurationMs(state));
    else if (state.playing && progress >= 1) state.tick();
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (relevantChange(state, previous)) sync();
  });
  sync();
  return () => {
    unsubscribe();
    stop();
  };
}
