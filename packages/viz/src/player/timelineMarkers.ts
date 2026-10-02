import { INITIAL_STEP } from '../lab/labReducers.ts';
import { scopeStarts } from '../lab/scopeNavigation.ts';
import type { AnyStateStep } from '../lab/stateSteps.ts';

export interface TimelineMarkers {
  /** Steps where a new round (scope level 0) begins, excluding the very first step. */
  rounds: number[];
  /** Steps whose op has a breakpoint. */
  breakpoints: number[];
}

export function timelineMarkers(steps: readonly Pick<AnyStateStep, 'scope' | 'op'>[], breakpoints: readonly string[]): TimelineMarkers {
  return {
    rounds: scopeStarts(steps).filter((step) => step > 0),
    breakpoints: steps.flatMap((step, index) => (breakpoints.includes(step.op) ? [index] : [])),
  };
}

/** Position of `step` along a slider over [-1, stepCount - 1], as a fraction 0..1. */
export function markerPosition(step: number, stepCount: number): number {
  const span = stepCount - 1 - INITIAL_STEP;
  return span <= 0 ? 0 : (step - INITIAL_STEP) / span;
}
