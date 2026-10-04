import { describe, expect, it } from 'vitest';
import { chunk } from './chunk.ts';

describe('chunk', () => {
  it('groups items in order, the last group may be shorter', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([...'abcd'], 4)).toEqual([['a', 'b', 'c', 'd']]);
    expect(chunk([], 3)).toEqual([]);
  });
});
