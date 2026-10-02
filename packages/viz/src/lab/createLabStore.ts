import { createStore, type StoreApi } from 'zustand/vanilla';
import type { FacetKey, TraceBundle } from '@cryventure/core';
import {
  INITIAL_STEP,
  clampSpeed,
  initialLabData,
  seekTo,
  startPlaying,
  stepBy,
  tick,
  withBundle,
  type LabData,
} from './labReducers.ts';

export interface LabActions {
  setBundle(bundle: TraceBundle | null): void;
  seek(step: number): void;
  first(): void;
  last(): void;
  next(): void;
  prev(): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  /** Playback tick: advance one step, pausing at the end. */
  tick(): void;
  setSpeed(speed: number): void;
  select(valueRefId: string | null): void;
  setDerivedFacet(key: FacetKey, data: unknown): void;
}

export type LabState = LabData & LabActions;
export type LabStore = StoreApi<LabState>;

/** One store per lab instance (never a module singleton), so several labs can share a page. */
export function createLabStore(bundle: TraceBundle | null = null): LabStore {
  return createStore<LabState>()((set, get) => ({
    ...initialLabData(bundle),
    setBundle: (next) => set(withBundle(next)),
    seek: (step) => set((state) => seekTo(state, step)),
    first: () => set((state) => seekTo(state, INITIAL_STEP)),
    last: () => set((state) => seekTo(state, state.stepCount - 1)),
    next: () => set((state) => stepBy(state, 1)),
    prev: () => set((state) => stepBy(state, -1)),
    play: () => set(startPlaying),
    pause: () => set({ playing: false }),
    togglePlay: () => (get().playing ? get().pause() : get().play()),
    tick: () => set(tick),
    setSpeed: (speed) => set({ speed: clampSpeed(speed) }),
    select: (valueRefId) => set({ selection: { valueRefId } }),
    setDerivedFacet: (key, data) => set((state) => ({ derivedFacets: { ...state.derivedFacets, [key]: data } })),
  }));
}
