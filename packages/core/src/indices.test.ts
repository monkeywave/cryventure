import { describe, expect, it } from 'vitest';
import { allIndices } from './indices.ts';

describe('allIndices', () => {
  it('lists 0..length-1', () => {
    expect(allIndices(3)).toEqual([0, 1, 2]);
    expect(allIndices(0)).toEqual([]);
  });
});
