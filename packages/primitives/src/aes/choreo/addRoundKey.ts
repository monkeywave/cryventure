import type { ChoreographyContext, StepChoreography } from '@cryventure/core';
import { allIndices, BLOCK_BYTES } from '../state.ts';
import { stepRoundKeyIndex } from './context.ts';
import { beat, focusState, pulseAndFlip, stateNode } from './tracks.ts';

/** AddRoundKey: the round key is loaded (its cells pulse), then all 16 state bytes pulse and flip to s ⊕ k. */
export const ADD_ROUND_KEY_DURATION = 1.5;

const LOAD = { start: 0.02, length: 0.36 };
const XOR = { start: 0.35, length: 0.6 };

export function addRoundKeyChoreography(context: ChoreographyContext): StepChoreography {
  const indices = allIndices(BLOCK_BYTES);
  const roundKey = stepRoundKeyIndex(context);
  return {
    duration: ADD_ROUND_KEY_DURATION,
    tracks: [
      ...indices.flatMap((index) => pulseAndFlip({ region: 'roundKey', index }, LOAD.start, LOAD.length)),
      ...indices.flatMap((index) => pulseAndFlip(stateNode(index), XOR.start, XOR.length)),
    ],
    beats: [
      beat(0, 'addRoundKey', 'load', { roundKey }, { region: 'roundKey', indices }),
      beat(XOR.start, 'addRoundKey', 'xor', { roundKey }, focusState(indices)),
    ],
  };
}
