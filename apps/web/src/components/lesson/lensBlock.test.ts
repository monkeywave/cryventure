import { describe, expect, it } from 'vitest';
import { lensBlockOf } from './lensBlock.ts';

describe('lensBlockOf', () => {
  it('accepts level or only with a known lens', () => {
    expect(lensBlockOf({ level: 'engineer' })).toEqual({ match: 'level', lens: 'engineer' });
    expect(lensBlockOf({ only: 'story' })).toEqual({ match: 'only', lens: 'story' });
  });

  it('requires exactly one of level and only', () => {
    expect(() => lensBlockOf({})).toThrow(/exactly one/);
    expect(() => lensBlockOf({ level: 'story', only: 'story' })).toThrow(/exactly one/);
  });

  it('rejects unknown lenses', () => {
    expect(() => lensBlockOf({ level: 'wizard' })).toThrow(/unknown lens/);
  });
});
