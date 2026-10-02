import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import {
  DEFAULT_SPEED,
  INITIAL_STEP,
  clampSpeed,
  clampStep,
  initialLabData,
  isAtEnd,
  lastStep,
  seekTo,
  startPlaying,
  stepBy,
  tick,
  withBundle,
  type LabData,
} from './labReducers.ts';

const data = (overrides: Partial<LabData> = {}): LabData => ({ ...initialLabData(createFixtureBundle()), ...overrides });

describe('lab reducers', () => {
  it('clampStep keeps integers within [-1, n-1] and maps non-finite to -1', () => {
    expect(clampStep(-5, 3)).toBe(-1);
    expect(clampStep(9, 3)).toBe(2);
    expect(clampStep(1.7, 3)).toBe(1);
    expect(clampStep(Number.NaN, 3)).toBe(INITIAL_STEP);
    expect(clampStep(4, 0)).toBe(-1);
  });

  it('clampSpeed bounds to the offered speeds', () => {
    expect(clampSpeed(0.1)).toBe(0.5);
    expect(clampSpeed(10)).toBe(4);
    expect(clampSpeed(2)).toBe(2);
    expect(clampSpeed(Number.NaN)).toBe(DEFAULT_SPEED);
  });

  it('initialLabData derives the step count and starts paused at the initial state', () => {
    expect(data()).toMatchObject({ stepCount: 3, step: -1, playing: false, speed: 1, selection: { valueRefId: null }, derivedFacets: {} });
    expect(lastStep(data())).toBe(2);
  });

  it('withBundle resets playhead, selection and derived facets but not speed', () => {
    const next = withBundle(null);
    expect(next).toMatchObject({ bundle: null, stepCount: 0, step: -1, playing: false });
    expect(next).not.toHaveProperty('speed');
  });

  it('seekTo and stepBy clamp', () => {
    expect(seekTo(data(), 7)).toEqual({ step: 2 });
    expect(stepBy(data({ step: 0 }), 1)).toEqual({ step: 1 });
    expect(stepBy(data({ step: -1 }), -1)).toEqual({ step: -1 });
  });

  it('isAtEnd is true on the last step and for empty timelines', () => {
    expect(isAtEnd({ step: 2, stepCount: 3 })).toBe(true);
    expect(isAtEnd({ step: 1, stepCount: 3 })).toBe(false);
    expect(isAtEnd({ step: -1, stepCount: 0 })).toBe(true);
  });

  it('startPlaying restarts from the beginning at the end and refuses empty timelines', () => {
    expect(startPlaying(data({ step: 0 }))).toEqual({ playing: true });
    expect(startPlaying(data({ step: 2 }))).toEqual({ playing: true, step: -1 });
    expect(startPlaying(data({ stepCount: 0 }))).toEqual({ playing: false });
  });

  it('tick advances and stops on reaching the last step', () => {
    expect(tick(data({ step: 0, playing: true }))).toEqual({ step: 1, playing: true });
    expect(tick(data({ step: 1, playing: true }))).toEqual({ step: 2, playing: false });
    expect(tick(data({ step: 2, playing: true }))).toEqual({ playing: false });
  });
});
