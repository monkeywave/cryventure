import { describe, expect, it } from 'vitest';
import type { TraceBundle } from '@cryventure/core';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { distinctOps, opAt, stateFacetOf, stateSteps } from './stateSteps.ts';

const bundle = createFixtureBundle();
const withoutState = (): TraceBundle => ({ ...bundle, facets: { 'narration@default': bundle.facets['narration@default'] } });

describe('stateFacetOf', () => {
  it("returns the bundle's state facet", () => {
    expect(stateFacetOf(bundle)).toBe(bundle.facets['state@default']);
  });

  it('is undefined without a bundle or a state facet', () => {
    expect(stateFacetOf(null)).toBeUndefined();
    expect(stateFacetOf(withoutState())).toBeUndefined();
  });
});

describe('stateSteps', () => {
  it("returns the state facet's steps", () => {
    expect(stateSteps(bundle).map((step) => step.op)).toEqual(['load', 'sub', 'mix']);
  });

  it('is empty (and stable) without a bundle or a state facet', () => {
    expect(stateSteps(null)).toEqual([]);
    expect(stateSteps(withoutState())).toEqual([]);
    expect(stateSteps(null)).toBe(stateSteps(withoutState()));
  });
});

describe('opAt', () => {
  it('returns the op of a step and undefined outside the timeline', () => {
    const steps = stateSteps(bundle);
    expect(opAt(steps, 0)).toBe('load');
    expect(opAt(steps, 2)).toBe('mix');
    expect(opAt(steps, -1)).toBeUndefined();
    expect(opAt(steps, 3)).toBeUndefined();
  });
});

describe('distinctOps', () => {
  it('lists each op once in first-seen order', () => {
    const steps = stateSteps(bundle);
    expect(distinctOps(steps)).toEqual(['load', 'sub', 'mix']);
    expect(distinctOps([...steps, ...steps].reverse())).toEqual(['mix', 'sub', 'load']);
    expect(distinctOps([])).toEqual([]);
  });
});
