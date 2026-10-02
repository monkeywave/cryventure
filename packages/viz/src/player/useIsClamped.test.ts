import { describe, expect, it } from 'vitest';
import { isClamped } from './useIsClamped.ts';

describe('isClamped', () => {
  it('is true only when the content is taller than the box beyond rounding slack', () => {
    expect(isClamped({ scrollHeight: 120, clientHeight: 60 })).toBe(true);
    expect(isClamped({ scrollHeight: 61, clientHeight: 60 })).toBe(false);
    expect(isClamped({ scrollHeight: 60, clientHeight: 60 })).toBe(false);
  });
});
