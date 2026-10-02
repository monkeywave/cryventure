import type { I18nRef } from './i18n.ts';
import type { AnyStateFacet, Snapshot, StateStep, Write } from './facets/state.ts';
import { stateAt } from './stateAt.ts';

/**
 * Choreography: how ONE state step animates between its "before" and "after" snapshots.
 *
 * Pure data, no DOM/React. The player owns a continuous playhead `t = step + progress` (progress ∈ [0,1]);
 * a view samples the current step's choreography at `progress` and renders the resulting node props.
 * Because sampling is a pure function of (choreography, progress), seeking and rewinding are exact.
 */

export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

/**
 * Visual properties a track can drive. Positions are in cell units of the node's own region grid.
 *
 * `value` is not a number shown on screen but a before/after switch: 0 = the node shows its value from
 * the `before` snapshot, 1 = its value from the `after` snapshot. Renderers flip at `VALUE_SWITCH`
 * (0.5), so a hard flip at `at` is keyframes `[{at:0,value:0},{at,value:0},{at,value:1}]`.
 * Nodes without a `value` track flip at progress 0.5.
 */
export type TrackProp = 'dx' | 'dy' | 'scale' | 'opacity' | 'emphasis' | 'value';

/** `value` track position (and, without a value track, step progress) at which a node shows its `after` value. */
export const VALUE_SWITCH = 0.5;

/**
 * Props every track must return to by progress 1, so the finished step renders exactly the `after`
 * snapshot (and seeking to step boundaries never shows leftover motion).
 */
export const NEUTRAL_NODE_PROPS: Readonly<Record<TrackProp, number>> = { dx: 0, dy: 0, scale: 1, opacity: 1, emphasis: 0, value: 1 };

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

function contextOf(facet: AnyStateFacet, index: number, step: StateStep<string, { op: string }>): ChoreographyContext {
  return { before: stateAt(facet, index - 1), after: stateAt(facet, index), step };
}

/** Context for `step`: the state before it, after it, and the step itself; `undefined` outside the facet. */
export function stepContext(facet: AnyStateFacet, step: number): ChoreographyContext | undefined {
  const current = facet.steps[step];
  return current === undefined ? undefined : contextOf(facet, step, current);
}

/** `stepContext` for every step of a facet, in step order. */
export function stepContexts(facet: AnyStateFacet): ChoreographyContext[] {
  return facet.steps.map((step, index) => contextOf(facet, index, step));
}

/** Optional export of a producer plugin; `undefined` means "use the generic fallback". */
export interface ChoreographyModule {
  choreograph(context: ChoreographyContext): StepChoreography | undefined;
}

export type NodeProps = Partial<Record<TrackProp, number>>;

/** Whether every prop present in `props` has its neutral value (an empty object is neutral). */
export function isNeutral(props: NodeProps): boolean {
  return Object.entries(props).every(([prop, value]) => value === NEUTRAL_NODE_PROPS[prop as TrackProp]);
}

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

/** Indices each region's writes cover (`[offset, offset + values.length)`), regions in first-write order. */
function writtenIndices(writes: readonly Write<string>[]): Map<string, Set<number>> {
  const byRegion = new Map<string, Set<number>>();
  for (const write of writes) {
    const indices = byRegion.get(write.region) ?? new Set<number>();
    write.values.forEach((_, i) => indices.add(write.offset + i));
    byRegion.set(write.region, indices);
  }
  return byRegion;
}

function changedIndices(indices: ReadonlySet<number>, before: readonly number[], after: readonly number[]): number[] {
  return [...indices].sort((a, b) => a - b).filter((index) => before[index] !== after[index]);
}

/**
 * Generic choreography for producers without their own: cells whose value a write changed pulse in a
 * left-to-right wave per region (one track per cell, even when several writes hit it).
 */
export function fallbackChoreography(context: ChoreographyContext): StepChoreography {
  const tracks: Track[] = [];
  for (const [region, indices] of writtenIndices(context.step.writes)) {
    const changed = changedIndices(indices, context.before[region] ?? [], context.after[region] ?? []);
    changed.forEach((index, order) => {
      const start = changed.length > 1 ? (order / changed.length) * 0.5 : 0;
      tracks.push(pulseTrack({ region, index }, start));
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
