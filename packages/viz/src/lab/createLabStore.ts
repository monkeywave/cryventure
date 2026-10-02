import { createStore, type StoreApi } from 'zustand/vanilla';
import { motionValue, type MotionValue } from 'motion/react';
import type { FacetKey, NodeRef, TraceBundle } from '@cryventure/core';
import {
  INITIAL_STEP,
  clampSpeed,
  initialLabData,
  lastStep,
  pausePlaying,
  seekTo,
  setRegionExpanded,
  startPlaying,
  stepBy,
  stepForward,
  tick,
  toggleBreakpoint,
  toggleCurrentBreakpoint,
  withBundle,
  type LabData,
  type LabMode,
  type StepTransition,
} from './labReducers.ts';
import { nextScopeStart, prevScopeStart } from './scopeNavigation.ts';
import { stateSteps } from './stateSteps.ts';

export interface LabActions {
  setBundle(bundle: TraceBundle | null): void;
  /** Exact jump to the end state of `step`. */
  seek(step: number): void;
  first(): void;
  last(): void;
  /** One step forward (animated in story mode). */
  next(): void;
  /** Exact jump to the end state of the previous step. */
  prev(): void;
  /** Jump to the start of the next section (outermost scope level, e.g. an AES round). */
  nextScope(): void;
  /** Jump to the start of the current section, or of the previous one when already there. */
  prevScope(): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Playback tick: advance one step (animated), pausing at the end or a breakpoint. */
  tick(): void;
  setSpeed(speed: number): void;
  setMode(mode: LabMode): void;
  toggleBreakpoint(op: string): void;
  /** Toggles the breakpoint on the current step's op. */
  toggleCurrentBreakpoint(): void;
  select(valueRefId: string | null): void;
  /** Selects (watches) one state node; `null` clears it. */
  selectNode(node: NodeRef | null): void;
  setDerivedFacet(key: FacetKey, data: unknown): void;
  /** Remembers whether the learner expanded or collapsed a collapsible region. */
  setRegionExpanded(regionId: string, expanded: boolean): void;
}

export interface LabPlayhead {
  /**
   * Continuous position inside the current step, 0..1 (`t = step + progress`). Views subscribe to it
   * directly (no React render per frame); the playback driver animates it, the store sets it on jumps.
   */
  progress: MotionValue<number>;
}

export type LabState = LabData & LabActions & LabPlayhead;
export type LabStore = StoreApi<LabState>;

const PROGRESS_FOR: Readonly<Record<StepTransition, number | undefined>> = { jump: 1, advance: 0, hold: undefined };

/** Keeps `progress` consistent with the step transition: jumps show the end state, advances start at 0. */
function syncProgress(store: LabStore): void {
  store.subscribe((state, previous) => {
    if (state.step === previous.step && state.transition === previous.transition) return;
    // Resuming a paused step (hold → advance) continues from where it froze.
    if (state.step === previous.step && previous.transition === 'hold' && state.transition === 'advance') return;
    const target = PROGRESS_FOR[state.transition];
    if (target !== undefined) state.progress.set(target);
  });
}

/** One store per lab instance (never a module singleton), so several labs can share a page. */
export function createLabStore(bundle: TraceBundle | null = null): LabStore {
  const store = createStore<LabState>()((set, get) => ({
    ...initialLabData(bundle),
    progress: motionValue(1),
    setBundle: (next) => set(withBundle(next)),
    seek: (step) => set((state) => seekTo(state, step)),
    first: () => set((state) => seekTo(state, INITIAL_STEP)),
    last: () => set((state) => seekTo(state, lastStep(state))),
    next: () => set(stepForward),
    prev: () => set((state) => stepBy(state, -1)),
    nextScope: () => set((state) => seekTo(state, nextScopeStart(stateSteps(state.bundle), state.step))),
    prevScope: () => set((state) => seekTo(state, prevScopeStart(stateSteps(state.bundle), state.step))),
    play: () => set(startPlaying),
    pause: () => set(pausePlaying),
    togglePlay: () => (get().playing ? get().pause() : get().play()),
    tick: () => set(tick),
    setSpeed: (speed) => set({ speed: clampSpeed(speed) }),
    setMode: (mode) => set({ mode }),
    toggleBreakpoint: (op) => set((state) => toggleBreakpoint(state, op)),
    toggleCurrentBreakpoint: () => set(toggleCurrentBreakpoint),
    select: (valueRefId) => set((state) => ({ selection: { ...state.selection, valueRefId } })),
    selectNode: (node) => set((state) => ({ selection: { ...state.selection, node } })),
    setDerivedFacet: (key, data) => set((state) => ({ derivedFacets: { ...state.derivedFacets, [key]: data } })),
    setRegionExpanded: (regionId, expanded) => set((state) => setRegionExpanded(state, regionId, expanded)),
  }));
  syncProgress(store);
  return store;
}
