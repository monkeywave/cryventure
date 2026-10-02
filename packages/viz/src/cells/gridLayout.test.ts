import { describe, expect, it } from 'vitest';
import { cellIndex, highlightMap, moveGridFocus } from './gridLayout.ts';

describe('cellIndex', () => {
  it('maps row-major and col-major layouts', () => {
    expect(cellIndex(1, 2, [4, 4], 'row-major')).toBe(6);
    expect(cellIndex(1, 2, [4, 4], 'col-major')).toBe(9);
    expect(cellIndex(0, 3, [2, 4])).toBe(3);
    expect(cellIndex(1, 3, [2, 4], 'col-major')).toBe(7);
  });
});

describe('highlightMap', () => {
  it('indexes highlight kinds, later entries winning', () => {
    const map = highlightMap([
      { indices: [0, 1], kind: 'read' },
      { indices: [1], kind: 'xor' },
    ]);
    expect([...map]).toEqual([
      [0, 'read'],
      [1, 'xor'],
    ]);
  });
});

describe('moveGridFocus', () => {
  const shape = [3, 4] as const;

  it('moves with arrows, clamped to the grid', () => {
    expect(moveGridFocus({ row: 0, col: 0 }, 'ArrowUp', shape)).toEqual({ row: 0, col: 0 });
    expect(moveGridFocus({ row: 0, col: 0 }, 'ArrowDown', shape)).toEqual({ row: 1, col: 0 });
    expect(moveGridFocus({ row: 2, col: 3 }, 'ArrowRight', shape)).toEqual({ row: 2, col: 3 });
    expect(moveGridFocus({ row: 2, col: 3 }, 'ArrowLeft', shape)).toEqual({ row: 2, col: 2 });
    expect(moveGridFocus({ row: 2, col: 3 }, 'ArrowDown', shape)).toEqual({ row: 2, col: 3 });
  });

  it('jumps within the row with Home/End and ignores other keys', () => {
    expect(moveGridFocus({ row: 1, col: 2 }, 'Home', shape)).toEqual({ row: 1, col: 0 });
    expect(moveGridFocus({ row: 1, col: 0 }, 'End', shape)).toEqual({ row: 1, col: 3 });
    expect(moveGridFocus({ row: 1, col: 0 }, 'Enter', shape)).toBeNull();
  });
});
