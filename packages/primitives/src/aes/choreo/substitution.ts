import type { ChoreographyContext, StepChoreography } from '@cryventure/core';
import { allIndices, BLOCK_BYTES } from '../state.ts';
import { stateAfter, stateBefore, stepRound } from './context.ts';
import { beat, cellColumn, cellRow, focusState, hexByte, pulseAndFlip, stateNode } from './tracks.ts';

/**
 * SubBytes / InvSubBytes: a diagonal wave (anti-diagonals row + col = 0 … 6) sweeps the state;
 * each byte pulses and flips to its S-box image at the pulse peak.
 */
export const SUBSTITUTION_DURATION = 2;

const WAVE_START = 0.08;
const WAVE_SPREAD = 0.6;
const PULSE_LENGTH = 0.28;
const LAST_DIAGONAL = 6;
const LOOKUP_BEAT_AT = 0.9;

/** Start of the pulse of byte `index`; later anti-diagonals start later. */
export function waveStart(index: number): number {
  const diagonal = cellRow(index) + cellColumn(index);
  return WAVE_START + (diagonal / LAST_DIAGONAL) * WAVE_SPREAD;
}

export function substitutionChoreography(op: 'subBytes' | 'invSubBytes', context: ChoreographyContext): StepChoreography {
  const tracks = allIndices(BLOCK_BYTES).flatMap((index) => pulseAndFlip(stateNode(index), waveStart(index), PULSE_LENGTH));
  const lookup = { byte: hexByte(stateBefore(context)[0]), result: hexByte(stateAfter(context)[0]) };
  return {
    duration: SUBSTITUTION_DURATION,
    tracks,
    beats: [beat(0, op, 'intro', { round: stepRound(context) }, focusState()), beat(LOOKUP_BEAT_AT, op, 'lookup', lookup, focusState([0]))],
  };
}
