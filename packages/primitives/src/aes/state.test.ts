import { describe, expect, it } from 'vitest';
import {
  allIndices,
  BLOCK_BYTES,
  bytesToState,
  cellIndex,
  columnOf,
  stateFromColumns,
  stateToBytes,
} from './state.ts';

const BLOCK = Array.from({ length: 16 }, (_, i) => i);

describe('cellIndex', () => {
  it('is column-major', () => {
    expect(cellIndex(0, 0)).toBe(0);
    expect(cellIndex(1, 0)).toBe(1);
    expect(cellIndex(0, 1)).toBe(4);
    expect(cellIndex(3, 3)).toBe(15);
  });
});

describe('bytesToState / stateToBytes', () => {
  it('roundtrips and copies', () => {
    const input = Uint8Array.from(BLOCK);
    const state = bytesToState(input);
    expect(stateToBytes(state)).toEqual(BLOCK);
    expect(stateToBytes(state)).not.toBe(state);
  });

  it('rejects blocks that are not 16 bytes', () => {
    expect(() => bytesToState([1, 2, 3])).toThrow(RangeError);
  });
});

describe('columnOf / stateFromColumns', () => {
  it('extracts columns top to bottom and rebuilds the state', () => {
    expect(columnOf(BLOCK, 2)).toEqual([8, 9, 10, 11]);
    const columns = [0, 1, 2, 3].map((col) => columnOf(BLOCK, col));
    expect(stateFromColumns(columns)).toEqual(BLOCK);
  });
});

describe('allIndices', () => {
  it('lists 0..n-1 (default one block)', () => {
    expect(allIndices()).toHaveLength(BLOCK_BYTES);
    expect(allIndices(3)).toEqual([0, 1, 2]);
  });
});
