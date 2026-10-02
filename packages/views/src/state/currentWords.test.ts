import { describe, expect, it } from 'vitest';
import { currentWords, roundKeyWords, wordsOfIndices } from './currentWords.ts';

describe('roundKeyWords', () => {
  it('maps a round key index to its four words', () => {
    expect(roundKeyWords(0)).toEqual([0, 1, 2, 3]);
    expect(roundKeyWords(10)).toEqual([40, 41, 42, 43]);
    expect(roundKeyWords(2, 2)).toEqual([4, 5]);
  });
});

describe('wordsOfIndices', () => {
  it('collects the distinct, sorted words of byte indices', () => {
    expect(wordsOfIndices([17, 4, 5, 16, 0])).toEqual([0, 1, 4]);
    expect(wordsOfIndices([])).toEqual([]);
  });
});

describe('currentWords', () => {
  const read = (indices: number[]) => ({ region: 'w', indices, kind: 'read' as const });

  it('is empty without a step or when the step does not touch the region', () => {
    expect(currentWords(undefined, 'w').size).toBe(0);
    expect(currentWords({ highlights: [{ region: 'state', indices: [0], kind: 'xor' }], roundKeyIndex: 1 }, 'w').size).toBe(0);
  });

  it('uses the op roundKeyIndex when present', () => {
    expect([...currentWords({ highlights: [read([0])], roundKeyIndex: 2 }, 'w')]).toEqual([8, 9, 10, 11]);
  });

  it('falls back to the words containing highlighted bytes', () => {
    expect([...currentWords({ highlights: [read([16, 17, 30])] }, 'w')]).toEqual([4, 7]);
    expect([...currentWords({ highlights: [read([0])], roundKeyIndex: 'x' }, 'w')]).toEqual([0]);
  });
});
