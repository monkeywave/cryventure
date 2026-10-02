import { gmul, xorBytes } from '@cryventure/core';
import { INV_SBOX, lookup, SBOX } from './sbox.ts';
import {
  cellIndex,
  columnOf,
  STATE_COLUMNS,
  STATE_ROWS,
  stateFromColumns,
  type AesState,
} from './state.ts';

/**
 * The four AES round transformations and their inverses (FIPS 197 §5.1, §5.3).
 * Pure functions over a 16-byte column-major state. Educational, NOT constant-time.
 */
export interface CellMove {
  from: number;
  to: number;
}

export interface ShiftResult {
  state: AesState;
  moves: CellMove[];
}

/** First row of the circulant MixColumns matrix and of its inverse. */
export const MIX_COLUMNS_ROW = [0x02, 0x03, 0x01, 0x01] as const;
export const INV_MIX_COLUMNS_ROW = [0x0e, 0x0b, 0x0d, 0x09] as const;

export function subBytes(state: readonly number[]): AesState {
  return state.map((byte) => lookup(SBOX, byte));
}

export function invSubBytes(state: readonly number[]): AesState {
  return state.map((byte) => lookup(INV_SBOX, byte));
}

/** Row r rotates left by r·direction positions (direction 1 = ShiftRows, -1 = InvShiftRows). */
function rotateRows(state: readonly number[], direction: 1 | -1): ShiftResult {
  const next = [...state];
  const moves: CellMove[] = [];
  for (let row = 1; row < STATE_ROWS; row++) {
    for (let col = 0; col < STATE_COLUMNS; col++) {
      const sourceCol = (col + direction * row + STATE_COLUMNS) % STATE_COLUMNS;
      const move = { from: cellIndex(row, sourceCol), to: cellIndex(row, col) };
      next[move.to] = state[move.from] ?? 0;
      moves.push(move);
    }
  }
  return { state: next, moves };
}

export function shiftRows(state: readonly number[]): ShiftResult {
  return rotateRows(state, 1);
}

export function invShiftRows(state: readonly number[]): ShiftResult {
  return rotateRows(state, -1);
}

/** Multiplies one column by the circulant matrix whose first row is `matrixRow`. */
function multiplyColumn(column: readonly number[], matrixRow: readonly number[]): number[] {
  return column.map((_, outRow) =>
    column.reduce(
      (sum, byte, inRow) => sum ^ gmul(matrixRow[(inRow - outRow + 4) % 4] ?? 0, byte),
      0,
    ),
  );
}

export function mixColumn(column: readonly number[]): number[] {
  return multiplyColumn(column, MIX_COLUMNS_ROW);
}

export function invMixColumn(column: readonly number[]): number[] {
  return multiplyColumn(column, INV_MIX_COLUMNS_ROW);
}

function mapColumns(
  state: readonly number[],
  mix: (column: readonly number[]) => number[],
): AesState {
  return stateFromColumns(
    Array.from({ length: STATE_COLUMNS }, (_, col) => mix(columnOf(state, col))),
  );
}

export function mixColumns(state: readonly number[]): AesState {
  return mapColumns(state, mixColumn);
}

export function invMixColumns(state: readonly number[]): AesState {
  return mapColumns(state, invMixColumn);
}

/** XOR with the round key; AddRoundKey is its own inverse. */
export function addRoundKey(state: readonly number[], roundKey: readonly number[]): AesState {
  return Array.from(xorBytes(state, roundKey));
}
