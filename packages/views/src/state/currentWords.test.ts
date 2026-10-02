import { describe, expect, it } from 'vitest';
import { currentWords, wordsOfIndices } from './currentWords.ts';

describe('wordsOfIndices', () => {
  it('collects the distinct, sorted words of element indices', () => {
    expect(wordsOfIndices([17, 4, 5, 16, 0], 4)).toEqual([0, 1, 4]);
    expect(wordsOfIndices([3, 4], 2)).toEqual([1, 2]);
    expect(wordsOfIndices([], 4)).toEqual([]);
  });
});

describe('currentWords', () => {
  const read = (indices: number[]) => ({ indices, kind: 'read' as const });

  it('is empty when the step highlights nothing in the region', () => {
    expect(currentWords([], 4).size).toBe(0);
  });

  it('marks the words containing the highlighted elements', () => {
    expect([...currentWords([read([16, 17, 30])], 4)]).toEqual([4, 7]);
    expect([...currentWords([read([32, 33, 34, 35]), read([36])], 4)]).toEqual([8, 9]);
  });
});
