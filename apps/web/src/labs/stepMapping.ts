import { INITIAL_STEP, type AnyStateFacet, type AnyStateStep } from '@cryventure/viz';

type Steps = Pick<AnyStateFacet, 'steps'>;

/**
 * Where the playhead lands when a lab re-runs with new params (the trace may change shape, e.g.
 * detail op ↔ round or another key size). The step is mapped by meaning, not by raw index:
 * 1. the initial state stays the initial state;
 * 2. the step with the same scope path and op (the same occurrence of it), e.g. round 5 MixColumns;
 * 3. else the first step of the same outermost scope (`scope[0]`, e.g. the same AES round);
 * 4. else the old index unchanged, which the store clamps to the new timeline (e.g. AES-256
 *    round 13 → AES-128 lands on the last step).
 */
export function mapStepAcrossTraces(oldFacet: Steps | undefined, oldStep: number, newFacet: Steps | undefined): number {
  const old = oldFacet?.steps[oldStep];
  if (oldStep === INITIAL_STEP || old === undefined || newFacet === undefined) return oldStep;
  const same = sameMeaningIndex(oldFacet!.steps, oldStep, newFacet.steps);
  if (same >= 0) return same;
  const sameSection = newFacet.steps.findIndex((step) => step.scope[0] === old.scope[0]);
  return sameSection >= 0 ? sameSection : oldStep;
}

function meaningOf(step: AnyStateStep): string {
  return `${step.scope.join('.')}|${step.op}`;
}

/** Index of the n-th step in `next` with the same scope path and op as the n-th such step in `previous`. */
function sameMeaningIndex(previous: readonly AnyStateStep[], step: number, next: readonly AnyStateStep[]): number {
  const meaning = meaningOf(previous[step]!);
  const occurrence = previous.slice(0, step).filter((candidate) => meaningOf(candidate) === meaning).length;
  const matches = next.flatMap((candidate, index) => (meaningOf(candidate) === meaning ? [index] : []));
  return matches[occurrence] ?? -1;
}
