import { describe, expect, it } from 'vitest';
import { mismatchedIndices } from './compare.ts';

describe('mismatchedIndices', () => {
  it('is empty for equal tables', () => expect(mismatchedIndices([1n, 2n], [1n, 2n])).toEqual([]));
  it('reports differing and missing entries by index', () => expect(mismatchedIndices([1, 9, 3], [1, 2, 3, 4])).toEqual([1, 3]));
});
