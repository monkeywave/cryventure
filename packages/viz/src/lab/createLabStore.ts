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
  withRerunBundle,
  type LabData,
  type LabMode,
  type StepTransition,
} from './labReducers.ts';
import { nextScopeStart, prevScopeStart } from './scopeNavigation.ts';
import { stateSteps } from './stateSteps.ts';

export interface SetBundleOptions {
  /** A re-run with new params: keep breakpoints and the watched node the new bundle still has (see `withRerunBundle`). */
  preserveDebugContext?: boolean;
}

/** A partial param change a view asks the host to apply (merged into the current params, then validated). */
export type ParamsPatch = Record<string, unknown>;

/** The host's re-run entry point for view-initiated param changes (wired by the app, e.g. via `LabRoot`). */
export type ParamsRequestHandler = (patch: ParamsPatch) => void;

/**
 * The host's link to a standalone lab for `producerId` opened with `params` (and `step`), e.g. a
 * chain view's "zoom into block i"; `undefined` when the host cannot link to that producer.
 */
export type LabHrefBuilder = (producerId: string, params: unknown, step?: number) => string | undefined;

/**
 * The host's link to the standalone lab of block cipher `producerId` encrypting one block (hex) under
 * a key (hex), e.g. a chain view's "zoom into block i"; `undefined` when the host cannot link to it.
 */
export type BlockLabHrefBuilder = (producerId: string, keyHex: string, blockHex: string) => string | undefined;

/** Host wiring fixed for the store's lifetime. */
export interface LabStoreOptions {
  /** Backs `labHref`; without it the action is absent and views render no link. */
  labHref?: LabHrefBuilder;
  /** Backs `blockLabHref`; without it the action is absent and views render no zoom link. */
  blockLabHref?: BlockLabHrefBuilder;
}

export interface LabActions {
  setBundle(bundle: TraceBundle | null, options?: SetBundleOptions): void;
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
  /** Asks the host to re-run the producer with `patch` merged into the current params; a no-op when no host is wired. */
  requestParams(patch: ParamsPatch): void;
  /** Host-side: installs (or, with `undefined`, removes) the handler behind `requestParams`. */
  setParamsRequestHandler(handler: ParamsRequestHandler | undefined): void;
  /** Optional, wired by the host (`LabStoreOptions.labHref`): a link to the standalone lab of another producer. */
  labHref?: LabHrefBuilder;
  /** Optional, wired by the host (`LabStoreOptions.blockLabHref`): a link to a block cipher's lab encrypting one block. */
  blockLabHref?: BlockLabHrefBuilder;
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
export function createLabStore(bundle: TraceBundle | null = null, options: LabStoreOptions = {}): LabStore {
  // Kept outside the state: swapping the host's handler must not re-render subscribers.
  let paramsRequestHandler: ParamsRequestHandler | undefined;
  const store = createStore<LabState>()((set, get) => ({
    ...initialLabData(bundle),
    progress: motionValue(1),
    setBundle: (next, options) => set((state) => (options?.preserveDebugContext ? withRerunBundle(state, next) : withBundle(next))),
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
    requestParams: (patch) => paramsRequestHandler?.(patch),
    setParamsRequestHandler: (handler) => {
      paramsRequestHandler = handler;
    },
    ...(options.labHref === undefined ? {} : { labHref: options.labHref }),
    ...(options.blockLabHref === undefined ? {} : { blockLabHref: options.blockLabHref }),
  }));
  syncProgress(store);
  return store;
}
