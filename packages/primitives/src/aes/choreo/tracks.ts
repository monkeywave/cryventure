import { i18nRef, pulseTrack, type Beat, type ChoreoKeyframe, type NodeRef, type Track, type TrackProp } from '@cryventure/core';
import { allIndices, BLOCK_BYTES, cellIndex, STATE_COLUMNS, STATE_ROWS } from '../state.ts';

/**
 * Track/beat helpers shared by the AES choreographies.
 *
 * `value` semantics and the neutral end props are core conventions (`TrackProp`, `NEUTRAL_NODE_PROPS`):
 * every track ends neutral, so progress = 1 renders exactly the `after` snapshot.
 */

export const BEAT_PREFIX = 'plugin.aes.beat.';

export function stateNode(index: number): NodeRef {
  return { region: 'state', index };
}

export function track(target: NodeRef, prop: TrackProp, keyframes: ChoreoKeyframe[]): Track {
  return { target, prop, keyframes };
}

/** Shows the `before` value until `at`, then the `after` value (a hard flip). */
export function valueFlip(target: NodeRef, at: number): Track {
  return track(target, 'value', [
    { at: 0, value: 0 },
    { at, value: 0 },
    { at, value: 1 },
  ]);
}

/** Emphasis pulse (0 → 1 → 0) over [start, start + length] with the value flip at its peak. */
export function pulseAndFlip(target: NodeRef, start: number, length: number): Track[] {
  return [pulseTrack(target, start, length), valueFlip(target, start + length / 2)];
}

/** A beat narrated by `plugin.aes.beat.<op>.<name>`. */
export function beat(at: number, op: string, name: string, params?: Record<string, string | number>, focus?: Beat['focus']): Beat {
  return { at, narration: i18nRef(`${BEAT_PREFIX}${op}.${name}`, params), ...(focus === undefined ? {} : { focus }) };
}

export function focusState(indices: number[] = allIndices(BLOCK_BYTES)): Beat['focus'] {
  return { region: 'state', indices };
}

export function rowIndices(row: number): number[] {
  return Array.from({ length: STATE_COLUMNS }, (_, col) => cellIndex(row, col));
}

export function columnIndices(col: number): number[] {
  return Array.from({ length: STATE_ROWS }, (_, row) => cellIndex(row, col));
}

export function cellRow(index: number): number {
  return index % STATE_ROWS;
}

export function cellColumn(index: number): number {
  return Math.floor(index / STATE_ROWS);
}

/** Two-digit lowercase hex of a byte, for narration params. */
export function hexByte(value: number | undefined): string {
  return (value ?? 0).toString(16).padStart(2, '0');
}
