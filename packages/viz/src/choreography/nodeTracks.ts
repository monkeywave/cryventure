import { activeBeat, sampleTrack, VALUE_SWITCH, type Beat, type StepChoreography, type Track, type TrackProp } from '@cryventure/core';

const NO_TRACKS: ReadonlyMap<number, readonly Track[]> = new Map();

/** Flat region index → tracks targeting it (for one region of a step's choreography). */
export function tracksForRegion(choreography: StepChoreography | undefined, region: string): ReadonlyMap<number, readonly Track[]> {
  if (choreography === undefined) return NO_TRACKS;
  const byIndex = new Map<number, Track[]>();
  for (const track of choreography.tracks) {
    if (track.target.region !== region) continue;
    const list = byIndex.get(track.target.index) ?? [];
    list.push(track);
    byIndex.set(track.target.index, list);
  }
  return byIndex;
}

/** Value switch point (core's `VALUE_SWITCH`): the node's `value` track reaching 0.5, else the middle of the step. */
export { VALUE_SWITCH };

/** Whether a node with this `value` track (none = switch mid-step) shows its `after` value at `progress`. */
export function showsAfter(valueTrack: Track | undefined, progress: number): boolean {
  const position = valueTrack === undefined ? progress : (sampleTrack(valueTrack, progress) ?? progress);
  return position >= VALUE_SWITCH;
}

/** Index of the active beat (−1 = none) — a cheap snapshot that changes only at beat boundaries. */
export function activeBeatIndex(choreography: StepChoreography | undefined, progress: number): number {
  if (choreography === undefined) return -1;
  const beat = activeBeat(choreography, progress);
  return beat === undefined ? -1 : choreography.beats.indexOf(beat);
}

/** Indices of `region` in the beat's focus, or `undefined` when the beat focuses nothing in it. */
export function focusIn(beat: Beat | undefined, region: string): ReadonlySet<number> | undefined {
  if (beat?.focus === undefined || beat.focus.region !== region) return undefined;
  return new Set(beat.focus.indices);
}

/** CSS custom property per animatable visual prop (`value` is handled as text, not style). */
export const NODE_STYLE_VARS: Readonly<Record<Exclude<TrackProp, 'value'>, string>> = {
  dx: '--cv-dx',
  dy: '--cv-dy',
  scale: '--cv-scale',
  opacity: '--cv-opacity',
  emphasis: '--cv-emphasis',
};
