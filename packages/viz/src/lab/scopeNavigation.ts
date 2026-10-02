import { INITIAL_STEP } from './labReducers.ts';
import type { AnyStateStep } from './stateSteps.ts';

/** Scope level of rounds (the outermost scope). */
export const ROUND_LEVEL = 0;

/** Steps that open a new scope at `level`: the first step and every step whose prefix up to `level` changes. */
export function scopeStarts(steps: readonly Pick<AnyStateStep, 'scope'>[], level: number = ROUND_LEVEL): number[] {
  const starts: number[] = [];
  steps.forEach((step, index) => {
    const previous = steps[index - 1];
    if (previous === undefined || !samePrefix(previous.scope, step.scope, level)) starts.push(index);
  });
  return starts;
}

function samePrefix(a: readonly number[], b: readonly number[], level: number): boolean {
  for (let depth = 0; depth <= level; depth++) if (a[depth] !== b[depth]) return false;
  return true;
}

/** "Step over": the next scope start after `step`, else the last step. */
export function nextScopeStart(steps: readonly Pick<AnyStateStep, 'scope'>[], step: number, level: number = ROUND_LEVEL): number {
  return scopeStarts(steps, level).find((start) => start > step) ?? steps.length - 1;
}

/** "Previous round": the start of the current scope when inside it, else the previous scope's start. */
export function prevScopeStart(steps: readonly Pick<AnyStateStep, 'scope'>[], step: number, level: number = ROUND_LEVEL): number {
  return scopeStarts(steps, level).findLast((start) => start < step) ?? INITIAL_STEP;
}
