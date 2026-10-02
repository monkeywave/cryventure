import type { I18nRef } from './i18n.ts';
import type { Snapshot, StateStep } from './facets/state.ts';

/**
 * Choreography: how ONE state step animates between its "before" and "after" snapshots.
 *
 * Pure data, no DOM/React. The player owns a continuous playhead `t = step + progress` (progress ∈ [0,1]);
 * a view samples the current step's choreography at `progress` and renders the resulting node props.
 * Because sampling is a pure function of (choreography, progress), seeking and rewinding are exact.
 */

export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

/** Visual properties a track can drive. Positions are in cell units of the node's own region grid. */
export type TrackProp = 'dx' | 'dy' | 'scale' | 'opacity' | 'emphasis' | 'value';

export interface ChoreoKeyframe {
  /** Position inside the step, 0..1. */
  at: number;
  value: number;
  /** Easing used to arrive at this keyframe from the previous one. */
  ease?: Ease;
}

/** A node is one element of a state region (e.g. byte 5 of `state`). */
export interface NodeRef {
  region: string;
  index: number;
}

export interface Track {
  target: NodeRef;
  prop: TrackProp;
  /** Sorted by ascending `at`. */
  keyframes: ChoreoKeyframe[];
}

/** A narrated moment inside a step (story mode shows it; the camera may focus a group of nodes). */
export interface Beat {
  at: number;
  narration?: I18nRef;
  focus?: { region: string; indices: number[] };
}

export interface StepChoreography {
  /** Duration in seconds at 1× speed (story mode). */
  duration: number;
  tracks: Track[];
  beats: Beat[];
}

export interface ChoreographyContext<R extends string = string, Op extends { op: string } = { op: string }> {
  before: Snapshot<R>;
  after: Snapshot<R>;
  step: StateStep<R, Op>;
}

/** Optional export of a producer plugin; `undefined` means "use the generic fallback". */
export interface ChoreographyModule {
  choreograph(context: ChoreographyContext): StepChoreography | undefined;
}

export type NodeProps = Partial<Record<TrackProp, number>>;

export const DEFAULT_STEP_DURATION = 1.2;

export function nodeId(ref: NodeRef): string {
  return `${ref.region}:${ref.index}`;
}

const easings: Record<Ease, (x: number) => number> = {
  linear: (x) => x,
  easeIn: (x) => x * x,
  easeOut: (x) => 1 - (1 - x) * (1 - x),
  easeInOut: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
};

export function applyEase(ease: Ease | undefined, x: number): number {
  return easings[ease ?? 'easeInOut'](clamp01(x));
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function interpolate(from: ChoreoKeyframe, to: ChoreoKeyframe, progress: number): number {
  const span = to.at - from.at;
  const local = span <= 0 ? 1 : (progress - from.at) / span;
  return from.value + (to.value - from.value) * applyEase(to.ease, local);
}

/** Value of a track at `progress` (holds the first/last keyframe value outside the keyed range). */
export function sampleTrack(track: Track, progress: number): number | undefined {
  const frames = track.keyframes;
  const first = frames[0];
  if (first === undefined) return undefined;
  if (progress <= first.at) return first.value;
  for (let i = 1; i < frames.length; i++) {
    const to = frames[i]!;
    if (progress <= to.at) return interpolate(frames[i - 1]!, to, progress);
  }
  return frames[frames.length - 1]!.value;
}

/** Samples every track; result maps `nodeId` → animated props. */
export function sampleChoreography(choreography: StepChoreography, progress: number): Map<string, NodeProps> {
  const result = new Map<string, NodeProps>();
  for (const track of choreography.tracks) {
    const value = sampleTrack(track, clamp01(progress));
    if (value === undefined) continue;
    const id = nodeId(track.target);
    result.set(id, { ...result.get(id), [track.prop]: value });
  }
  return result;
}

/** The last beat whose `at` has been reached, if any. */
export function activeBeat(choreography: StepChoreography, progress: number): Beat | undefined {
  let active: Beat | undefined;
  for (const beat of choreography.beats) if (beat.at <= progress) active = beat;
  return active;
}

function changedIndices(before: readonly number[], after: readonly number[]): number[] {
  const indices: number[] = [];
  after.forEach((value, index) => {
    if (before[index] !== value) indices.push(index);
  });
  return indices;
}

/** Generic choreography for producers without their own: written cells pulse in a left-to-right wave. */
export function fallbackChoreography(context: ChoreographyContext): StepChoreography {
  const tracks: Track[] = [];
  for (const write of context.step.writes) {
    const before = context.before[write.region] ?? [];
    const after = context.after[write.region] ?? [];
    const changed = changedIndices(before, after);
    changed.forEach((index, order) => {
      const start = changed.length > 1 ? (order / changed.length) * 0.5 : 0;
      tracks.push(pulseTrack({ region: write.region, index }, start));
    });
  }
  return { duration: DEFAULT_STEP_DURATION, tracks, beats: [{ at: 0, narration: context.step.narration }] };
}

/** Emphasis pulse 0 → 1 → 0 starting at `start`, plus the value flip at the pulse peak. */
export function pulseTrack(target: NodeRef, start: number, length = 0.5): Track {
  const peak = Math.min(1, start + length / 2);
  return {
    target,
    prop: 'emphasis',
    keyframes: [
      { at: start, value: 0 },
      { at: peak, value: 1, ease: 'easeOut' },
      { at: Math.min(1, start + length), value: 0, ease: 'easeIn' },
    ],
  };
}
