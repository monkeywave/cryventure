import { describe, expect, it } from 'vitest';
import { isUpdateRun } from './updateRun.ts';

describe('isUpdateRun', () => {
  it('is on only when the named flag is 1', () => {
    expect([isUpdateRun('CV_X', { CV_X: '1' }), isUpdateRun('CV_X', { CV_X: '0' }), isUpdateRun('CV_X', { CV_Y: '1' }), isUpdateRun('CV_X', {})]).toEqual([true, false, false, false]);
  });
});
