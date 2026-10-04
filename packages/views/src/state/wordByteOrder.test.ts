import { describe, expect, it } from 'vitest';
import type { Track } from '@cryventure/core';
import type { GridMotion } from '@cryventure/viz';
import {
  displayIndex,
  gridInputsToDisplay,
  hasLittleEndianWords,
  highlightsToDisplay,
  indexSetToDisplay,
  motionToDisplay,
  reversesWords,
  toDisplayOrder,
  tracksToDisplay,
} from './wordByteOrder.ts';

const littleWords = { elemsPerWord: 4, wordsPerLine: 1, labelPrefix: 'w', byteOrder: 'little' as const };

describe('reversesWords', () => {
  it('reverses only little-endian words of more than one element shown as integers', () => {
    expect(reversesWords(littleWords, 'integer')).toBe(true);
    expect(reversesWords(littleWords, 'memory')).toBe(false);
    expect(reversesWords({ ...littleWords, byteOrder: 'big' }, 'integer')).toBe(false);
    expect(reversesWords({ ...littleWords, byteOrder: undefined }, 'integer')).toBe(false);
    expect(reversesWords({ ...littleWords, elemsPerWord: 1 }, 'integer')).toBe(false);
    expect(reversesWords(undefined, 'integer')).toBe(false);
  });
});

describe('hasLittleEndianWords', () => {
  it('finds regions whose words layout is little-endian', () => {
    expect(hasLittleEndianWords([{ layout: { kind: 'grid' } }, { layout: { kind: 'words', wordBytes: 8, byteOrder: 'little' } }])).toBe(true);
    expect(hasLittleEndianWords([{ layout: { kind: 'words', wordBytes: 4 } }, {}])).toBe(false);
  });
});

describe('displayIndex', () => {
  it('reverses the elements within each word and is its own inverse', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((index) => displayIndex(index, 4))).toEqual([3, 2, 1, 0, 7, 6, 5, 4]);
    for (let index = 0; index < 16; index += 1) expect(displayIndex(displayIndex(index, 8), 8)).toBe(index);
  });
});

describe('toDisplayOrder', () => {
  it('shows bytes 01 02 03 04 as the integer 04030201', () => {
    expect(toDisplayOrder([0x01, 0x02, 0x03, 0x04, 0xa0, 0xb0, 0xc0, 0xd0], 4)).toEqual([0x04, 0x03, 0x02, 0x01, 0xd0, 0xc0, 0xb0, 0xa0]);
  });
});

describe('index mapping', () => {
  it('maps index sets, highlights and tracks onto the displayed positions', () => {
    expect(indexSetToDisplay(undefined, 4)).toBeUndefined();
    expect([...indexSetToDisplay(new Set([0, 5]), 4)!]).toEqual([3, 6]);
    expect(highlightsToDisplay([{ indices: [0, 1], kind: 'xor' }], 4)).toEqual([{ indices: [3, 2], kind: 'xor' }]);
    const track = { target: { region: 'w', index: 4 }, prop: 'opacity', keys: [] } as unknown as Track;
    expect([...tracksToDisplay(new Map([[4, [track]]]), 4)]).toEqual([[7, [track]]]);
  });

  it('maps a whole grid motion (values before, placeholders, tracks)', () => {
    const motion = { progress: {} as GridMotion['progress'], before: [1, 2, 3, 4], unwrittenBefore: new Set([0]), unwrittenAfter: undefined, tracks: new Map() };
    const shown = motionToDisplay(motion, 4)!;
    expect(shown.before).toEqual([4, 3, 2, 1]);
    expect([...shown.unwrittenBefore!]).toEqual([3]);
    expect(shown.unwrittenAfter).toBeUndefined();
    expect(shown.progress).toBe(motion.progress);
    expect(motionToDisplay(undefined, 4)).toBeUndefined();
  });
});

describe('gridInputsToDisplay', () => {
  const inputs = { values: [1, 2, 3, 4], highlights: [{ indices: [0], kind: 'xor' as const }], motion: undefined, focus: new Set([1]), unwritten: new Set([2]), selectedIndex: 3 };

  it('returns the inputs unchanged when words are not reversed', () => {
    expect(gridInputsToDisplay(inputs, undefined)).toBe(inputs);
  });

  it('moves values, marks and the selection to their displayed positions', () => {
    const shown = gridInputsToDisplay(inputs, 4);
    expect(shown.values).toEqual([4, 3, 2, 1]);
    expect(shown.highlights).toEqual([{ indices: [3], kind: 'xor' }]);
    expect([...shown.focus!]).toEqual([2]);
    expect([...shown.unwritten!]).toEqual([1]);
    expect(shown.selectedIndex).toBe(0);
  });
});
