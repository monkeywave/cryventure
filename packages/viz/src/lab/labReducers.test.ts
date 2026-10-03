import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import {
  withDerivedFacets,
  DEFAULT_SPEED,
  INITIAL_STEP,
  clampSpeed,
  clampStep,
  initialLabData,
  isAtEnd,
  isBreakpointStep,
  isLastStep,
  lastStep,
  selectStepCount,
  pausePlaying,
  seekTo,
  setRegionExpanded,
  startPlaying,
  stepBy,
  stepForward,
  tick,
  toggleBreakpoint,
  toggleCurrentBreakpoint,
  preferVariant,
  withBundle,
  withRerunBundle,
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
    expect(data()).toMatchObject({ step: -1, playing: false, speed: 1, selection: { valueRefId: null }, derivedFacets: {} });
    expect(selectStepCount(data())).toBe(3);
    expect(lastStep(data())).toBe(2);
  });

  it('withBundle resets playhead, selection, breakpoints and derived facets but keeps speed and mode', () => {
    const next = withBundle(null);
    expect(next).toMatchObject({
      bundle: null,
      step: -1,
      playing: false,
      transition: 'jump',
      breakpoints: [],
      selection: { valueRefId: null, node: null },
      derivedFacets: {},
    });
    expect(next).not.toHaveProperty('speed');
    expect(next).not.toHaveProperty('mode');
  });

  it('seekTo and stepBy clamp and jump to the end state', () => {
    expect(seekTo(data(), 7)).toEqual({ step: 2, transition: 'jump' });
    expect(stepBy(data({ step: 0 }), 1)).toEqual({ step: 1, transition: 'jump' });
    expect(stepBy(data({ step: -1 }), -1)).toEqual({ step: -1, transition: 'jump' });
  });

  it('stepForward animates in story mode and jumps in debugger mode', () => {
    expect(stepForward(data({ mode: 'story', step: 0 }))).toEqual({ step: 1, transition: 'advance' });
    expect(stepForward(data({ mode: 'debugger', step: 0 }))).toEqual({ step: 1, transition: 'jump' });
  });

  it('stepForward stays on the last step', () => {
    expect(stepForward(data({ mode: 'story', step: 2 }))).toEqual({ step: 2, transition: 'jump' });
    expect(stepForward(data({ mode: 'debugger', step: 2 }))).toEqual({ step: 2, transition: 'jump' });
  });

  it('isAtEnd is true on the last step and for empty timelines', () => {
    expect(isAtEnd(data({ step: 2 }))).toBe(true);
    expect(isAtEnd(data({ step: 1 }))).toBe(false);
    expect(isAtEnd({ step: -1, bundle: null })).toBe(true);
    expect(isLastStep(2, 3)).toBe(true);
    expect(isLastStep(1, 3)).toBe(false);
    expect(isLastStep(-1, 0)).toBe(true);
  });

  it('startPlaying restarts from the beginning at the end and refuses empty timelines', () => {
    expect(startPlaying(data({ step: 0 }))).toEqual({ playing: true, transition: 'jump' });
    expect(startPlaying(data({ step: 2 }))).toEqual({ playing: true, step: -1, transition: 'jump' });
    expect(startPlaying(data({ bundle: null }))).toEqual({ playing: false });
  });

  it('startPlaying resumes a held step animation and keeps other transitions', () => {
    expect(startPlaying(data({ step: 0, transition: 'hold' }))).toEqual({ playing: true, transition: 'advance' });
    expect(startPlaying(data({ step: 0, transition: 'advance' }))).toEqual({ playing: true, transition: 'advance' });
  });

  it('pausePlaying freezes an in-flight advance and keeps other transitions', () => {
    expect(pausePlaying(data({ playing: true, transition: 'advance' }))).toEqual({ playing: false, transition: 'hold' });
    expect(pausePlaying(data({ playing: true, transition: 'jump' }))).toEqual({ playing: false, transition: 'jump' });
    expect(pausePlaying(data({ transition: 'hold' }))).toEqual({ playing: false, transition: 'hold' });
  });

  it('tick advances (animated) and stops on reaching the last step', () => {
    expect(tick(data({ step: 0, playing: true }))).toEqual({ step: 1, transition: 'advance', playing: true });
    expect(tick(data({ step: 1, playing: true }))).toEqual({ step: 2, transition: 'advance', playing: false });
    expect(tick(data({ step: 2, playing: true }))).toEqual({ playing: false });
  });

  it('tick stops on a step whose op has a breakpoint (debugger mode only)', () => {
    expect(tick(data({ step: 0, playing: true, mode: 'debugger', breakpoints: ['sub'] }))).toEqual({ step: 1, transition: 'advance', playing: false });
    expect(tick(data({ step: 0, playing: true, mode: 'story', breakpoints: ['sub'] }))).toEqual({ step: 1, transition: 'advance', playing: true });
    expect(tick(data({ step: -1, playing: true, mode: 'debugger', breakpoints: ['sub'] }))).toMatchObject({ step: 0, playing: true });
  });
});

describe('region disclosure', () => {
  it('starts without explicit choices and is kept across bundles', () => {
    expect(initialLabData().regionsExpanded).toEqual({});
    expect(withBundle(null)).not.toHaveProperty('regionsExpanded');
  });

  it('remembers one choice per region without touching the others', () => {
    const once = setRegionExpanded(data(), 'w', true);
    expect(once.regionsExpanded).toEqual({ w: true });
    expect(setRegionExpanded(data({ regionsExpanded: { w: true } }), 'x', false).regionsExpanded).toEqual({ w: true, x: false });
  });
});

describe('breakpoints', () => {
  it('isBreakpointStep matches the step op only in debugger mode', () => {
    const debug = data({ mode: 'debugger', breakpoints: ['sub'] });
    expect(isBreakpointStep(debug, 1)).toBe(true);
    expect(isBreakpointStep(debug, 0)).toBe(false);
    expect(isBreakpointStep(debug, -1)).toBe(false);
    expect(isBreakpointStep(debug, 9)).toBe(false);
    expect(isBreakpointStep(data({ mode: 'story', breakpoints: ['sub'] }), 1)).toBe(false);
    expect(isBreakpointStep(data({ mode: 'debugger', breakpoints: [] }), 1)).toBe(false);
    expect(isBreakpointStep(data({ mode: 'debugger', breakpoints: ['sub'], bundle: null }), 1)).toBe(false);
  });

  it('toggleBreakpoint adds and removes an op', () => {
    expect(toggleBreakpoint({ breakpoints: [] }, 'sub')).toEqual({ breakpoints: ['sub'] });
    expect(toggleBreakpoint({ breakpoints: ['load', 'sub'] }, 'sub')).toEqual({ breakpoints: ['load'] });
  });

  it('toggleCurrentBreakpoint toggles the current op and is a no-op at the initial state', () => {
    expect(toggleCurrentBreakpoint(data({ step: 2 }))).toEqual({ breakpoints: ['mix'] });
    expect(toggleCurrentBreakpoint(data({ step: 2, breakpoints: ['mix'] }))).toEqual({ breakpoints: [] });
    expect(toggleCurrentBreakpoint(data({ step: -1 }))).toEqual({});
  });
});

describe('withRerunBundle', () => {
  const watched = (node: LabData['selection']['node'], breakpoints: string[]) => data({ breakpoints, selection: { valueRefId: 'v1', node } });

  it('keeps breakpoints on ops the new trace still has and a watched node inside its region', () => {
    const next = withRerunBundle(watched({ region: 'w', index: 47 }, ['sub', 'gone']), createFixtureBundle());
    expect(next.breakpoints).toEqual(['sub']);
    expect(next.selection).toEqual({ valueRefId: null, node: { region: 'w', index: 47 } });
    expect(next.step).toBe(INITIAL_STEP);
  });

  it('drops a watched node past its region or in a missing region', () => {
    expect(withRerunBundle(watched({ region: 'w', index: 48 }, []), createFixtureBundle()).selection?.node).toBeNull();
    expect(withRerunBundle(watched({ region: 'gone', index: 0 }, []), createFixtureBundle()).selection?.node).toBeNull();
  });

  it('clears everything without a new bundle', () => {
    expect(withRerunBundle(watched({ region: 'state', index: 0 }, ['sub']), null)).toMatchObject({ breakpoints: [], selection: { valueRefId: null, node: null } });
  });
});

describe('withDerivedFacets', () => {
  it('merges facets for the current bundle', () => {
    const bundle = createFixtureBundle();
    expect(withDerivedFacets({ bundle, derivedFacets: { 'demo@a': 1 } }, bundle, { 'demo@b': 2 })).toEqual({ derivedFacets: { 'demo@a': 1, 'demo@b': 2 } });
  });

  it('ignores facets derived for a stale bundle', () => {
    expect(withDerivedFacets({ bundle: createFixtureBundle(), derivedFacets: {} }, createFixtureBundle(), { 'demo@a': 1 })).toEqual({});
  });

  it('changes nothing when every key already holds the same value (no new derivedFacets object)', () => {
    const bundle = createFixtureBundle();
    const facet = { n: 1 };
    expect(withDerivedFacets({ bundle, derivedFacets: { 'demo@a': facet, 'demo@b': 2 } }, bundle, { 'demo@a': facet })).toEqual({});
    expect(withDerivedFacets({ bundle, derivedFacets: { 'demo@a': facet } }, bundle, {})).toEqual({});
  });
});

describe('preferVariant', () => {
  it('puts the chosen variant first, without duplicates', () => {
    expect(preferVariant({ preferredVariants: [] }, 'x86')).toEqual({ preferredVariants: ['x86'] });
    expect(preferVariant({ preferredVariants: ['arm', 'x86+ref', 'x86'] }, 'x86')).toEqual({ preferredVariants: ['x86', 'arm', 'x86+ref'] });
  });

  it('is kept by withBundle', () => {
    expect(withBundle(null)).not.toHaveProperty('preferredVariants');
  });
});

