import type { FacetKey, NodeRef, TraceBundle } from '@cryventure/core';
import { opAt, stateSteps } from './stateSteps.ts';
import { timelineLength } from './timeline.ts';

/** Sentinel step before the first event: the initial state. */
export const INITIAL_STEP = -1;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export const DEFAULT_SPEED = 1;

/** Story: narrated, auto-advancing animation. Debugger: exact jumps, rounds, breakpoints, watch. */
export type LabMode = 'story' | 'debugger';
export const LAB_MODES: readonly LabMode[] = ['story', 'debugger'];
export const DEFAULT_MODE: LabMode = 'debugger';

/**
 * How the progress playhead reaches the current step:
 * `jump` = shown at its end state, `advance` = animates 0 → 1, `hold` = frozen (paused mid-step).
 */
export type StepTransition = 'jump' | 'advance' | 'hold';

export interface Selection {
  /** Hovered/selected ValueRef id (linked brushing bus); `null` when nothing is selected. */
  valueRefId: string | null;
  /** Selected state node (e.g. the watched byte); `null` when nothing is selected. */
  node: NodeRef | null;
}

export interface LabData {
  bundle: TraceBundle | null;
  stepCount: number;
  /** Integer in [-1, stepCount - 1]. */
  step: number;
  playing: boolean;
  speed: number;
  mode: LabMode;
  transition: StepTransition;
  /** Ops (`StateStep.op`) that stop debugger playback. */
  breakpoints: readonly string[];
  selection: Selection;
  /** Extension point: facets produced lazily by derivers, keyed `kind@variant`. */
  derivedFacets: Partial<Record<FacetKey, unknown>>;
}

export function lastStep(state: Pick<LabData, 'stepCount'>): number {
  return state.stepCount - 1;
}

export function clampStep(step: number, stepCount: number): number {
  if (!Number.isFinite(step)) return INITIAL_STEP;
  return Math.min(Math.max(Math.trunc(step), INITIAL_STEP), stepCount - 1);
}

export function clampSpeed(speed: number): number {
  const min = SPEEDS[0];
  const max = SPEEDS[SPEEDS.length - 1] ?? min;
  return Number.isFinite(speed) ? Math.min(Math.max(speed, min), max) : DEFAULT_SPEED;
}

export function initialLabData(bundle: TraceBundle | null = null): LabData {
  return {
    bundle,
    stepCount: timelineLength(bundle),
    step: INITIAL_STEP,
    playing: false,
    speed: DEFAULT_SPEED,
    mode: DEFAULT_MODE,
    transition: 'jump',
    breakpoints: [],
    selection: { valueRefId: null, node: null },
    derivedFacets: {},
  };
}

/** A new bundle resets the playhead, selection, breakpoints and derived facets but keeps speed and mode. */
export function withBundle(bundle: TraceBundle | null): Partial<LabData> {
  const { speed: _speed, mode: _mode, ...reset } = initialLabData(bundle);
  return reset;
}

/** Exact jump: the target step is shown at its end state. */
export function seekTo(state: LabData, step: number): Partial<LabData> {
  return { step: clampStep(step, state.stepCount), transition: 'jump' };
}

/** One step forward: animated in story mode, an exact jump in debugger mode. */
export function stepForward(state: LabData): Partial<LabData> {
  if (state.mode === 'debugger' || isAtEnd(state)) return stepBy(state, 1);
  return { step: state.step + 1, transition: 'advance' };
}

export function stepBy(state: LabData, delta: number): Partial<LabData> {
  return seekTo(state, state.step + delta);
}

export function isAtEnd(state: Pick<LabData, 'step' | 'stepCount'>): boolean {
  return state.step >= lastStep(state);
}

/** Playing from the end restarts at the initial state; an empty timeline cannot play. */
export function startPlaying(state: LabData): Partial<LabData> {
  if (state.stepCount === 0) return { playing: false };
  if (isAtEnd(state)) return { playing: true, step: INITIAL_STEP, transition: 'jump' };
  return { playing: true, transition: state.transition === 'hold' ? 'advance' : state.transition };
}

/** Pausing freezes an in-flight step animation where it is. */
export function pausePlaying(state: LabData): Partial<LabData> {
  return { playing: false, transition: state.transition === 'advance' ? 'hold' : state.transition };
}

/** Debugger playback stops on steps whose op has a breakpoint. */
export function isBreakpointStep(state: Pick<LabData, 'bundle' | 'mode' | 'breakpoints'>, step: number): boolean {
  if (state.mode !== 'debugger' || state.breakpoints.length === 0) return false;
  const op = opAt(stateSteps(state.bundle), step);
  return op !== undefined && state.breakpoints.includes(op);
}

/** One playback tick: advance (animated), and stop once the last step or a breakpoint is shown. */
export function tick(state: LabData): Partial<LabData> {
  if (isAtEnd(state)) return { playing: false };
  const next = state.step + 1;
  return { step: next, transition: 'advance', playing: next < lastStep(state) && !isBreakpointStep(state, next) };
}

export function toggleBreakpoint(state: Pick<LabData, 'breakpoints'>, op: string): Partial<LabData> {
  const breakpoints = state.breakpoints.includes(op) ? state.breakpoints.filter((entry) => entry !== op) : [...state.breakpoints, op];
  return { breakpoints };
}

/** Toggles the breakpoint on the current step's op (no-op at the initial state). */
export function toggleCurrentBreakpoint(state: LabData): Partial<LabData> {
  const op = opAt(stateSteps(state.bundle), state.step);
  return op === undefined ? {} : toggleBreakpoint(state, op);
}
