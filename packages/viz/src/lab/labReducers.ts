import type { FacetKey, TraceBundle } from '@cryventure/core';
import { timelineLength } from './timeline.ts';

/** Sentinel step before the first event: the initial state. */
export const INITIAL_STEP = -1;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export const DEFAULT_SPEED = 1;

export interface Selection {
  /** Hovered/selected ValueRef id (linked brushing bus); `null` when nothing is selected. */
  valueRefId: string | null;
}

export interface LabData {
  bundle: TraceBundle | null;
  stepCount: number;
  /** Integer in [-1, stepCount - 1]. */
  step: number;
  playing: boolean;
  speed: number;
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
    selection: { valueRefId: null },
    derivedFacets: {},
  };
}

/** A new bundle resets the playhead, selection and derived facets but keeps the speed. */
export function withBundle(bundle: TraceBundle | null): Partial<LabData> {
  const { speed: _keep, ...reset } = initialLabData(bundle);
  return reset;
}

export function seekTo(state: LabData, step: number): Partial<LabData> {
  return { step: clampStep(step, state.stepCount) };
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
  return isAtEnd(state) ? { playing: true, step: INITIAL_STEP } : { playing: true };
}

/** One playback tick: advance, and stop once the last step is shown. */
export function tick(state: LabData): Partial<LabData> {
  if (isAtEnd(state)) return { playing: false };
  const next = state.step + 1;
  return { step: next, playing: next < lastStep(state) };
}
