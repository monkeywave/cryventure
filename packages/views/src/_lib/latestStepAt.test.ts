import { describe, expect, it } from 'vitest';
import { latestStepAt } from './latestStepAt.ts';

describe('latestStepAt', () => {
  const steps = [{ step: -1 }, { step: 3 }, { step: 7 }];

  it('returns undefined before the first step and for an empty list', () => {
    expect(latestStepAt(steps, -2)).toBeUndefined();
    expect(latestStepAt([], 0)).toBeUndefined();
  });

  it('returns the exact step or the latest one before the playhead', () => {
    expect(latestStepAt(steps, -1)?.step).toBe(-1);
    expect(latestStepAt(steps, 3)?.step).toBe(3);
    expect(latestStepAt(steps, 5)?.step).toBe(3);
    expect(latestStepAt(steps, 99)?.step).toBe(7);
  });

  it('keeps the element type', () => {
    const found = latestStepAt([{ step: 0, name: 'zero' }], 1);
    expect(found?.name).toBe('zero');
  });
});
