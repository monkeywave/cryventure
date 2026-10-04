import { createStore, type StoreApi } from 'zustand/vanilla';
import { motionValue, type MotionValue } from 'motion/react';
import type { FacetKey, LabZoom, NodeRef, TraceBundle } from '@cryventure/core';
import {
  INITIAL_STEP,
  clampSpeed,
  initialLabData,
  lastStep,
  pausePlaying,
  preferVariant,
  seekTo,
  setRegionExpanded,
  startPlaying,
  stepBy,
  stepForward,
  tick,
  toggleBreakpoint,
  toggleCurrentBreakpoint,
  withBundle,
  withDerivedFacets,
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
 * The host's link to the standalone lab of `zoom.producerId` opened with `zoom.params` (docs/M7.md §4),
 * e.g. a derivation node's "Open in the HMAC lab"; `undefined` when the host cannot link to that
 * producer (unregistered, or params too long for a deep link).
 */
export type LabHrefBuilder = (zoom: LabZoom) => string | undefined;

/**
 * The host's link to the standalone lab of block cipher `producerId` encrypting one block (hex) under
 * a key (hex), e.g. a chain view's "zoom into block i"; `undefined` when the host cannot link to it.
 */
export type BlockLabHrefBuilder = (producerId: string, keyHex: string, blockHex: string) => string | undefined;

/**
 * The host's title of the lab of `producerId` as a message key (its manifest's `titleKey`), e.g. for a
 * zoom link "Open the lab “HMAC …”"; `undefined` when the host does not know that producer.
 */
export type LabTitleLookup = (producerId: string) => string | undefined;

/** Host wiring fixed for the store's lifetime. */
export interface LabStoreOptions {
  /** Backs `labHref`; without it the action is absent and views render no link. */
  labHref?: LabHrefBuilder;
  /** Backs `blockLabHref`; without it the action is absent and views render no zoom link. */
  blockLabHref?: BlockLabHrefBuilder;
  /** Backs `labTitle`; without it the action is absent and views name no target lab. */
  labTitle?: LabTitleLookup;
  /** The initial lab-wide preferred variant (e.g. a lesson's `variant="x86_64-aesni"`). */
  preferredVariant?: string;
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
  /**
   * Adds one deriver's facets for `bundle` in one update; a no-op (same `derivedFacets` object, no
   * notification) when `bundle` is no longer the lab's bundle or when nothing changes.
   */
  setDerivedFacets(bundle: TraceBundle, facets: Partial<Record<FacetKey, unknown>>): void;
  /** Records the learner's variant choice lab-wide: every view showing a facet with that variant switches to it. */
  preferVariant(variant: string): void;
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
  /** Optional, wired by the host (`LabStoreOptions.labTitle`): the title key of another producer's lab. */
  labTitle?: LabTitleLookup;
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

/** The host's optional link wiring as actions; an absent builder leaves its action absent (views render no link). */
function hostLinks({ labHref, blockLabHref, labTitle }: LabStoreOptions): Pick<LabActions, 'labHref' | 'blockLabHref' | 'labTitle'> {
  return {
    ...(labHref === undefined ? {} : { labHref }),
    ...(blockLabHref === undefined ? {} : { blockLabHref }),
    ...(labTitle === undefined ? {} : { labTitle }),
  };
}

/** One store per lab instance (never a module singleton), so several labs can share a page. */
export function createLabStore(bundle: TraceBundle | null = null, options: LabStoreOptions = {}): LabStore {
  // Kept outside the state: swapping the host's handler must not re-render subscribers.
  let paramsRequestHandler: ParamsRequestHandler | undefined;
  const store = createStore<LabState>()((set, get) => ({
    ...initialLabData(bundle),
    ...(options.preferredVariant === undefined ? {} : { preferredVariants: [options.preferredVariant] }),
    progress: motionValue(1),
    setBundle: (next, options) => set((state) => (options?.preserveDebugContext ? withRerunBundle(state, next) : withBundle(next))),
    setDerivedFacets: (forBundle, facets) => {
      // An empty update would still notify every subscriber, so only a real change is set.
      const update = withDerivedFacets(get(), forBundle, facets);
      if (update.derivedFacets !== undefined) set(update);
    },
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
    preferVariant: (variant) => set((state) => preferVariant(state, variant)),
    setRegionExpanded: (regionId, expanded) => set((state) => setRegionExpanded(state, regionId, expanded)),
    requestParams: (patch) => paramsRequestHandler?.(patch),
    setParamsRequestHandler: (handler) => {
      paramsRequestHandler = handler;
    },
    ...hostLinks(options),
  }));
  syncProgress(store);
  return store;
}
