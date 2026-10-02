import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { ROUND_LEVEL, nextScopeStart, prevScopeStart, scopeStarts } from './scopeNavigation.ts';
import { stateSteps } from './stateSteps.ts';

const steps = stateSteps(createFixtureBundle());
const scoped = (...scopes: number[][]) => scopes.map((scope) => ({ scope }));

describe('scopeStarts', () => {
  it('lists the first step and every step that opens a new round', () => {
    expect(ROUND_LEVEL).toBe(0);
    expect(scopeStarts(steps)).toEqual([0, 1]);
  });

  it('compares the scope prefix up to the requested level', () => {
    expect(scopeStarts(steps, 1)).toEqual([0, 1, 2]);
    expect(scopeStarts(scoped([0, 0], [0, 0], [0, 1], [1, 1]), 1)).toEqual([0, 2, 3]);
  });

  it('is empty without steps', () => {
    expect(scopeStarts([])).toEqual([]);
  });
});

describe('nextScopeStart', () => {
  it('finds the next round start after the step, including from the initial state', () => {
    expect(nextScopeStart(steps, -1)).toBe(0);
    expect(nextScopeStart(steps, 0)).toBe(1);
  });

  it('goes to the last step past the last round start', () => {
    expect(nextScopeStart(steps, 1)).toBe(2);
    expect(nextScopeStart(steps, 2)).toBe(2);
  });

  it('honours the level', () => {
    expect(nextScopeStart(steps, 1, 1)).toBe(2);
  });
});

describe('prevScopeStart', () => {
  it('goes to the start of the current round when inside it', () => {
    expect(prevScopeStart(steps, 2)).toBe(1);
  });

  it('goes to the previous round when already at a round start', () => {
    expect(prevScopeStart(steps, 1)).toBe(0);
  });

  it('goes to the initial state from the first round', () => {
    expect(prevScopeStart(steps, 0)).toBe(-1);
    expect(prevScopeStart(steps, -1)).toBe(-1);
  });

  it('honours the level', () => {
    expect(prevScopeStart(steps, 2, 1)).toBe(1);
  });
});
