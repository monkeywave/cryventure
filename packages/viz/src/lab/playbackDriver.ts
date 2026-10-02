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
 * A reduced-motion dwell in progress: progress already shows 1, so the driver itself remembers how much
 * of the step's dwell has elapsed. Without it, any restart (speed, mode, pause/resume) would see a
 * finished step while playing and advance immediately, skipping the rest of the dwell.
 */
interface Dwell {
  step: number;
  bundle: LabState['bundle'];
  /** Fraction of the dwell already elapsed, 0..1 (speed-independent, like `progress`). */
  elapsed: number;
}

function isDwellOf(dwell: Dwell | undefined, state: LabState): dwell is Dwell {
  return dwell !== undefined && dwell.step === state.step && dwell.bundle === state.bundle;
}

/** Runs the remaining fraction of `dwell` (whose full length is `durationMs`), tracking `elapsed`. */
function runDwell(scheduler: FrameScheduler, dwell: Dwell, durationMs: number, onDone: () => void): () => void {
  const from = dwell.elapsed;
  return runTimed(scheduler, durationMs * (1 - from), (fraction) => (dwell.elapsed = from + (1 - from) * fraction), onDone);
}

/** Animates `progress` linearly from `from` to 1 over the remaining fraction of `durationMs`. */
function runTween(scheduler: FrameScheduler, state: LabState, from: number, durationMs: number, onDone: () => void): () => void {
  return runTimed(scheduler, durationMs * (1 - from), (fraction) => state.progress.set(from + (1 - from) * fraction), onDone);
}

/**
 * Drives the continuous playhead: an `advance` step animates `progress` linearly to 1 over its
 * duration; while playing, a finished step ticks to the next one. Returns a dispose function.
 * Choreographies apply their own easing, so the playhead itself stays linear (and seeks stay exact).
 * With reduced motion a step shows its end state at once and dwells for its duration instead; a restart
 * mid-dwell (speed, mode, pause/resume) resumes the remaining fraction at the current speed.
 */
export function createPlaybackDriver({ store, scheduler, stepDurationMs, reducedMotion }: PlaybackDriverOptions): () => void {
  let cancel: (() => void) | undefined;
  let dwell: Dwell | undefined;
  const stop = () => {
    cancel?.();
    cancel = undefined;
  };
  const finish = () => {
    cancel = undefined;
    dwell = undefined;
    if (store.getState().playing) store.getState().tick();
  };
  const dwellOn = (state: LabState, current: Dwell) => {
    dwell = current;
    cancel = runDwell(scheduler, current, stepDurationMs(state), finish);
  };
  const animate = (state: LabState, from: number) => {
    if (!reducedMotion()) return void (cancel = runTween(scheduler, state, from, stepDurationMs(state), finish));
    state.progress.set(1);
    if (state.playing) dwellOn(state, { step: state.step, bundle: state.bundle, elapsed: 0 });
  };
  const sync = () => {
    stop();
    const state = store.getState();
    const progress = state.progress.get();
    if (!isDwellOf(dwell, state)) dwell = undefined;
    if (progress < 1 && state.transition === 'advance') animate(state, progress);
    else if (state.playing && dwell !== undefined && reducedMotion()) dwellOn(state, dwell);
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
