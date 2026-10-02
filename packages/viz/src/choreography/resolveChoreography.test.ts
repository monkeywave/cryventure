import { describe, expect, it, vi } from 'vitest';
import { fallbackChoreography, stepContext, type ChoreographyModule, type StepChoreography } from '@cryventure/core';
import { stateFacetOf, type AnyStateFacet } from '../lab/stateSteps.ts';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { choreographStep, createChoreographyResolver } from './resolveChoreography.ts';

const facet = () => stateFacetOf(createFixtureBundle()) as AnyStateFacet;
const custom: StepChoreography = { duration: 2, tracks: [], beats: [{ at: 0.25 }] };

describe('choreographStep', () => {
  const context = () => stepContext(facet(), 1)!;

  it("uses the module's choreography", () => {
    expect(choreographStep({ choreograph: () => custom }, context())).toBe(custom);
  });

  it('falls back without a module, when the module returns undefined, or when it throws', () => {
    const fallback = fallbackChoreography(context());
    expect(choreographStep(undefined, context())).toEqual(fallback);
    expect(choreographStep({ choreograph: () => undefined }, context())).toEqual(fallback);
    const throwing: ChoreographyModule = {
      choreograph: () => {
        throw new Error('boom');
      },
    };
    expect(choreographStep(throwing, context())).toEqual(fallback);
  });
});

describe('createChoreographyResolver', () => {
  it('memoises per facet and step', () => {
    const choreograph = vi.fn(() => undefined);
    const resolver = createChoreographyResolver({ choreograph });
    const state = facet();
    const first = resolver.at(state, 1);
    expect(first).toBeDefined();
    expect(resolver.at(state, 1)).toBe(first);
    expect(choreograph).toHaveBeenCalledOnce();
    expect(resolver.at(state, 2)).not.toBe(first);
    expect(resolver.at(facet(), 1)).not.toBe(first);
    expect(choreograph).toHaveBeenCalledTimes(3);
  });

  it('passes the step context to the module', () => {
    const choreograph = vi.fn(() => custom);
    const state = facet();
    expect(createChoreographyResolver({ choreograph }).at(state, 2)).toBe(custom);
    expect(choreograph).toHaveBeenCalledWith(stepContext(state, 2));
  });

  it('is undefined without a facet or at the initial state', () => {
    const resolver = createChoreographyResolver();
    expect(resolver.at(undefined, 0)).toBeUndefined();
    expect(resolver.at(facet(), -1)).toBeUndefined();
  });
});
