import { applyEase, type ChoreoKeyframe, type ChoreographyContext, type StepChoreography, type Track } from '@cryventure/core';
import type { CellMove } from '../ops.ts';
import { STATE_COLUMNS } from '../state.ts';
import { stepMoves, stepRound } from './context.ts';
import { beat, cellColumn, cellRow, focusState, rowIndices, stateNode, track, valueFlip } from './tracks.ts';

/**
 * ShiftRows / InvShiftRows, animated in "before" coordinate space and then snapped.
 *
 * Node `state:k` starts out showing before[k] (value = 0) at its own cell and slides by the row's
 * travel (−r for ShiftRows, +r for InvShiftRows). A cell whose path leaves the grid wraps: it fades
 * out while moving with its row until it is `WRAP_OVERHANG` columns past the edge, jumps to the opposite
 * side while invisible, and fades back in, finishing at its landing cell. When a row's slide ends every node of that row
 * snaps simultaneously to dx = 0 and value = 1: since after[to] = before[from], the snapped picture
 * equals the slid one, so the snap is invisible and progress = 1 has only neutral props.
 * Rows run one after another (row 1, then 2, then 3); row 0 stays put.
 */
export const SHIFT_DURATION = 2.5;

const FIRST_ROW_START = 0.08;
const ROW_SLOT = 0.3;

export interface RowWindow {
  start: number;
  end: number;
}

/** Time window of row `row` (1..3). */
export function rowWindow(row: number): RowWindow {
  const start = FIRST_ROW_START + (row - 1) * ROW_SLOT;
  return { start, end: start + ROW_SLOT };
}

/** Columns a cell of `row` travels: negative = left (ShiftRows), positive = right (InvShiftRows). */
export function rowTravel(op: 'shiftRows' | 'invShiftRows', row: number): number {
  return op === 'shiftRows' ? -row : row;
}

/** Whether a cell sliding `travel` columns from `col` leaves the grid and must wrap around. */
export function wrapsAround(col: number, travel: number): boolean {
  const landing = col + travel;
  return landing < 0 || landing >= STATE_COLUMNS;
}

function slideKeyframes(travel: number, { start, end }: RowWindow): ChoreoKeyframe[] {
  return [
    { at: 0, value: 0 },
    { at: start, value: 0 },
    { at: end, value: travel, ease: 'easeInOut' },
    { at: end, value: 0 },
  ];
}

/** How far (in columns) a wrapping cell may leave the grid while fading, so it never covers a neighbouring region. */
export const WRAP_OVERHANG = 0.5;

/** Keyframes per wrap path (linear between samples of the row's easeInOut curve). */
const WRAP_SAMPLES = 12;

/** x with applyEase('easeInOut', x) = y. */
export function inverseEaseInOut(y: number): number {
  return y < 0.5 ? Math.sqrt(y / 2) : 1 - Math.sqrt((1 - y) / 2);
}

interface WrapPath {
  col: number;
  travel: number;
  window: RowWindow;
}

/** Progress at which a wrapping cell, moving in step with its row, is `WRAP_OVERHANG` past its exit edge. */
function teleportAt({ col, travel, window }: WrapPath): { at: number; fraction: number } {
  const edge = travel < 0 ? -WRAP_OVERHANG : STATE_COLUMNS - 1 + WRAP_OVERHANG;
  const fraction = (edge - col) / travel;
  return { at: window.start + inverseEaseInOut(fraction) * (window.end - window.start), fraction };
}

/**
 * A wrapping cell moves exactly like its row (same easeInOut, so cells keep their spacing and never
 * overlap); `WRAP_OVERHANG` columns past the exit edge it jumps ±4 columns to the opposite side.
 */
function wrapKeyframes(path: WrapPath): ChoreoKeyframe[] {
  const { travel, window } = path;
  const jump = travel < 0 ? STATE_COLUMNS : -STATE_COLUMNS;
  const teleport = teleportAt(path);
  const samples = Array.from({ length: WRAP_SAMPLES }, (_, k) => (k + 1) / WRAP_SAMPLES).map((x) => ({
    at: window.start + x * (window.end - window.start),
    position: travel * applyEase('easeInOut', x),
  }));
  const frame = (at: number, value: number): ChoreoKeyframe => ({ at, value, ease: 'linear' });
  return [
    { at: 0, value: 0 },
    { at: window.start, value: 0 },
    ...samples.filter((sample) => sample.at < teleport.at).map((sample) => frame(sample.at, sample.position)),
    frame(teleport.at, travel * teleport.fraction),
    frame(teleport.at, travel * teleport.fraction + jump),
    ...samples.filter((sample) => sample.at > teleport.at).map((sample) => frame(sample.at, sample.position + jump)),
    { at: window.end, value: 0 },
  ];
}

/** Fades out until the jump and back in by the end of the row's slide. */
function fadeKeyframes(path: WrapPath): ChoreoKeyframe[] {
  const { start, end } = path.window;
  const { at } = teleportAt(path);
  return [
    { at: 0, value: 1 },
    { at: start, value: 1 },
    { at, value: 0, ease: 'easeIn' },
    { at: end, value: 1, ease: 'easeOut' },
  ];
}

function moveTracks(op: 'shiftRows' | 'invShiftRows', move: CellMove): Track[] {
  const node = stateNode(move.from);
  const row = cellRow(move.from);
  const window = rowWindow(row);
  const travel = rowTravel(op, row);
  const tracks = [valueFlip(node, window.end)];
  if (!wrapsAround(cellColumn(move.from), travel)) return [...tracks, track(node, 'dx', slideKeyframes(travel, window))];
  const path = { col: cellColumn(move.from), travel, window };
  return [...tracks, track(node, 'dx', wrapKeyframes(path)), track(node, 'opacity', fadeKeyframes(path))];
}

function rowBeats(op: 'shiftRows' | 'invShiftRows', rows: number[]): StepChoreography['beats'] {
  return rows.map((row) => beat(rowWindow(row).start, op, 'row', { row, shift: row }, focusState(rowIndices(row))));
}

export function shiftChoreography(op: 'shiftRows' | 'invShiftRows', context: ChoreographyContext): StepChoreography {
  const moves = stepMoves(context);
  const rows = [...new Set(moves.map((move) => cellRow(move.from)))].sort((a, b) => a - b);
  return {
    duration: SHIFT_DURATION,
    tracks: moves.flatMap((move) => moveTracks(op, move)),
    beats: [beat(0, op, 'intro', { round: stepRound(context) }, focusState(rowIndices(0))), ...rowBeats(op, rows)],
  };
}
