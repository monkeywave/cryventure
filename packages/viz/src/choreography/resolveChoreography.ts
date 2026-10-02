import { fallbackChoreography, stateAt, type ChoreographyContext, type ChoreographyModule, type StepChoreography } from '@cryventure/core';
import type { AnyStateFacet } from '../lab/stateSteps.ts';

/** Context for `step`: the state before it, after it, and the step itself. */
export function choreographyContext(facet: AnyStateFacet, step: number): ChoreographyContext | undefined {
  const current = facet.steps[step];
  if (current === undefined) return undefined;
  return { before: stateAt(facet, step - 1), after: stateAt(facet, step), step: current };
}

/** The producer's choreography for one step, or the generic fallback (also when the producer throws). */
export function choreographStep(module: ChoreographyModule | undefined, context: ChoreographyContext): StepChoreography {
  try {
    return module?.choreograph(context) ?? fallbackChoreography(context);
  } catch {
    return fallbackChoreography(context);
  }
}

export interface ChoreographyResolver {
  /** Memoised per facet and step; `undefined` for the initial step or without a state facet. */
  at(facet: AnyStateFacet | undefined, step: number): StepChoreography | undefined;
}

export function createChoreographyResolver(module?: ChoreographyModule): ChoreographyResolver {
  const cache = new WeakMap<AnyStateFacet, Map<number, StepChoreography>>();
  const byStepOf = (facet: AnyStateFacet) => {
    const existing = cache.get(facet);
    if (existing !== undefined) return existing;
    const created = new Map<number, StepChoreography>();
    cache.set(facet, created);
    return created;
  };
  return {
    at(facet, step) {
      if (facet === undefined) return undefined;
      const byStep = byStepOf(facet);
      const cached = byStep.get(step);
      if (cached !== undefined) return cached;
      const context = choreographyContext(facet, step);
      if (context === undefined) return undefined;
      const choreography = choreographStep(module, context);
      byStep.set(step, choreography);
      return choreography;
    },
  };
}
