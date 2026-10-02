import { i18nRef, type Highlight, type HighlightKind } from '@cryventure/core';
import type { AesRegion, AesStep } from './aesTrace.ts';
import type { CellMove } from './ops.ts';
import { allIndices, BLOCK_BYTES } from './state.ts';
import type { Word } from './keyExpansion.ts';

/** Builders for the individual AES trace steps (writes + highlights + narration ref). */
const STEP_KEY_PREFIX = 'plugin.aes.step.';

export function stepKey(op: string): string {
  return `${STEP_KEY_PREFIX}${op}`;
}

function wholeRegion(
  region: AesRegion,
  kind: HighlightKind,
  count: number = BLOCK_BYTES,
): Highlight<AesRegion> {
  return { region, indices: allIndices(count), kind };
}

function stateWrite(state: readonly number[]): AesStep['writes'] {
  return [{ region: 'state', offset: 0, values: [...state] }];
}

export function inputStep(round: number, state: readonly number[]): AesStep {
  return {
    op: 'input',
    round,
    writes: stateWrite(state),
    highlights: [wholeRegion('state', 'write')],
    narration: i18nRef(stepKey('input')),
  };
}

export function keyExpansionStep(round: number, words: readonly Word[], keyWords: number): AesStep {
  const bytes = words.flat();
  return {
    op: 'keyExpansion',
    round,
    writes: [{ region: 'w', offset: 0, values: bytes }],
    highlights: [wholeRegion('w', 'write', bytes.length)],
    narration: i18nRef(stepKey('keyExpansion'), { words: words.length, keyWords }),
  };
}

function scheduleSlice(roundKeyIndex: number): number[] {
  return allIndices(BLOCK_BYTES).map((i) => roundKeyIndex * BLOCK_BYTES + i);
}

export function addRoundKeyStep(
  round: number,
  roundKeyIndex: number,
  roundKey: readonly number[],
  state: readonly number[],
): AesStep {
  return {
    op: 'addRoundKey',
    round,
    roundKeyIndex,
    writes: [{ region: 'roundKey', offset: 0, values: [...roundKey] }, ...stateWrite(state)],
    highlights: [
      { region: 'w', indices: scheduleSlice(roundKeyIndex), kind: 'read' },
      wholeRegion('roundKey', 'read'),
      wholeRegion('state', 'xor'),
    ],
    narration: i18nRef(stepKey('addRoundKey'), { round, roundKey: roundKeyIndex }),
  };
}

export function substitutionStep(
  op: 'subBytes' | 'invSubBytes',
  round: number,
  state: readonly number[],
): AesStep {
  return {
    op,
    round,
    writes: stateWrite(state),
    highlights: [wholeRegion('state', 'sbox')],
    narration: i18nRef(stepKey(op), { round }),
  };
}

export function shiftStep(
  op: 'shiftRows' | 'invShiftRows',
  round: number,
  state: readonly number[],
  moves: CellMove[],
): AesStep {
  return {
    op,
    round,
    moves,
    writes: stateWrite(state),
    highlights: [{ region: 'state', indices: moves.map((move) => move.to), kind: 'move' }],
    narration: i18nRef(stepKey(op), { round }),
  };
}

export function mixStep(
  op: 'mixColumns' | 'invMixColumns',
  round: number,
  state: readonly number[],
): AesStep {
  return {
    op,
    round,
    writes: stateWrite(state),
    highlights: [wholeRegion('state', 'write')],
    narration: i18nRef(stepKey(op), { round }),
  };
}

export function outputStep(round: number): AesStep {
  return {
    op: 'output',
    round,
    writes: [],
    highlights: [wholeRegion('state', 'read')],
    narration: i18nRef(stepKey('output')),
  };
}
