import { pulseTrack, type ChoreographyContext, type StepChoreography, type Track } from '@cryventure/core';
import { STATE_COLUMNS } from '../state.ts';
import { stateAfter, stateBefore } from './context.ts';
import { beat, columnIndices, focusState, hexByte, stateNode, valueFlip } from './tracks.ts';

/**
 * MixColumns / InvMixColumns, one column at a time: column c owns [c/4, (c+1)/4]. Its four cells
 * pulse together while the output bytes s′0 … s′3 flip one after another; a focus beat introduces
 * the column and a formula beat shows s′0 as the matrix row times the column (e.g. 02·a ⊕ 03·b ⊕ c ⊕ d).
 */
export const MIX_DURATION = 4;

const SLOT = 1 / STATE_COLUMNS;
const PULSE_INSET = 0.01;
const FIRST_FLIP = 0.3;
const FLIP_SPACING = 0.15;
const FORMULA_BEAT_OFFSET = 0.06;

export interface ColumnWindow {
  start: number;
  end: number;
}

export function columnWindow(col: number): ColumnWindow {
  return { start: col * SLOT, end: (col + 1) * SLOT };
}

/** When output byte `row` of a column flips, as a fraction of that column's window. */
export function flipAt(col: number, row: number): number {
  return columnWindow(col).start + (FIRST_FLIP + row * FLIP_SPACING) * SLOT;
}

function columnTracks(col: number): Track[] {
  const { start, end } = columnWindow(col);
  return columnIndices(col).flatMap((index, row) => [
    pulseTrack(stateNode(index), start + PULSE_INSET, end - start - 2 * PULSE_INSET),
    valueFlip(stateNode(index), flipAt(col, row)),
  ]);
}

function formulaParams(context: ChoreographyContext, col: number): Record<string, string | number> {
  const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = columnIndices(col);
  const before = stateBefore(context);
  return { col, a0: hexByte(before[i0]), a1: hexByte(before[i1]), a2: hexByte(before[i2]), a3: hexByte(before[i3]), out: hexByte(stateAfter(context)[i0]) };
}

function columnBeats(op: 'mixColumns' | 'invMixColumns', context: ChoreographyContext, col: number): StepChoreography['beats'] {
  const { start } = columnWindow(col);
  const focus = focusState(columnIndices(col));
  return [beat(start, op, 'column', { col }, focus), beat(start + FORMULA_BEAT_OFFSET, op, 'formula', formulaParams(context, col), focus)];
}

export function mixChoreography(op: 'mixColumns' | 'invMixColumns', context: ChoreographyContext): StepChoreography {
  const columns = Array.from({ length: STATE_COLUMNS }, (_, col) => col);
  return {
    duration: MIX_DURATION,
    tracks: columns.flatMap(columnTracks),
    beats: columns.flatMap((col) => columnBeats(op, context, col)),
  };
}
