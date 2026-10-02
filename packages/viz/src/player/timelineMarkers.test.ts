import { describe, expect, it } from 'vitest';
import { stateSteps } from '../lab/stateSteps.ts';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { markerPosition, timelineMarkers } from './timelineMarkers.ts';

const steps = stateSteps(createFixtureBundle());

describe('timelineMarkers', () => {
  it('marks round starts after the first step', () => {
    expect(timelineMarkers(steps, []).rounds).toEqual([1]);
  });

  it('marks every step whose op has a breakpoint', () => {
    expect(timelineMarkers(steps, ['mix', 'load']).breakpoints).toEqual([0, 2]);
    const repeated = [...steps, ...steps].map((step, index) => ({ ...step, scope: [index] }));
    expect(timelineMarkers(repeated, ['sub'])).toEqual({ rounds: [1, 2, 3, 4, 5], breakpoints: [1, 4] });
  });

  it('is empty without steps', () => {
    expect(timelineMarkers([], ['sub'])).toEqual({ rounds: [], breakpoints: [] });
  });
});

describe('markerPosition', () => {
  it('maps [-1, stepCount - 1] onto 0..1', () => {
    expect(markerPosition(-1, 3)).toBe(0);
    expect(markerPosition(0, 3)).toBeCloseTo(1 / 3);
    expect(markerPosition(2, 3)).toBe(1);
  });

  it('is 0 for an empty timeline', () => {
    expect(markerPosition(-1, 0)).toBe(0);
  });
});
