import { getFacet, type AnyStateFacet, type StateStep, type TraceBundle } from '@cryventure/core';

export type { AnyStateFacet } from '@cryventure/core';
export type AnyStateStep = StateStep<string, { op: string }>;

const NO_STEPS: readonly AnyStateStep[] = [];

/** The bundle's state facet, if any. */
export function stateFacetOf(bundle: TraceBundle | null): AnyStateFacet | undefined {
  return bundle === null ? undefined : getFacet<AnyStateFacet>(bundle, 'state');
}

/** The state facet's steps (empty without a bundle or state facet). */
export function stateSteps(bundle: TraceBundle | null): readonly AnyStateStep[] {
  return stateFacetOf(bundle)?.steps ?? NO_STEPS;
}

export function opAt(steps: readonly AnyStateStep[], step: number): string | undefined {
  return steps[step]?.op;
}

/** Distinct ops in first-seen order (e.g. for breakpoint pickers). */
export function distinctOps(steps: readonly AnyStateStep[]): string[] {
  return [...new Set(steps.map((step) => step.op))];
}
