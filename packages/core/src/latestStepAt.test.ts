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
    expect(latestStepAt(steps, 7)?.step).toBe(7);
    expect(latestStepAt(steps, 99)?.step).toBe(7);
  });

  it('returns the entry itself, keeping the element type', () => {
    const entries = [{ step: 0, name: 'zero' }, { step: 2, name: 'two' }];
    expect(latestStepAt(entries, 1)).toBe(entries[0]);
    expect(latestStepAt(entries, 1)?.name).toBe('zero');
  });

  it('agrees with a linear scan for every playhead over lists of every length up to 9', () => {
    for (let length = 0; length <= 9; length++) {
      const list = Array.from({ length }, (_, index) => ({ step: index * 2 - 1 }));
      for (let playhead = -3; playhead <= 2 * length; playhead++) {
        expect(latestStepAt(list, playhead)).toBe(list.filter((entry) => entry.step <= playhead).at(-1));
      }
    }
  });

  it('handles a fractional playhead', () => {
    expect(latestStepAt(steps, 2.5)?.step).toBe(-1);
  });
});
