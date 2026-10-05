import { parseFacetKey, type FacetKind } from '@cryventure/core';

/**
 * Core's `latestStepAt` (behind `mathStepAt`, `fieldStepAt` and the sponge and wordops views) throws
 * on steps that are not strictly increasing. These checks reject such a facet in any bundle, under
 * any variant and whether or not the producer declares the kind, so no registered plugin can make a
 * view throw at render.
 */

/** The facet kinds whose `steps` the views read with `latestStepAt`. */
export const LATEST_STEP_FACET_KINDS: ReadonlySet<FacetKind> = new Set<FacetKind>(['math', 'field', 'wordops', 'sponge']);

/** Problems of one `steps` list: not an array, a non-numeric step, or a step not above its predecessor. */
function stepListProblems(key: string, steps: unknown): string[] {
  if (!Array.isArray(steps)) return [`${key}: steps is not an array`];
  const problems: string[] = [];
  let previous: number | undefined;
  steps.forEach((entry: unknown, index) => {
    const step = (entry as { step?: unknown } | null)?.step;
    if (typeof step !== 'number' || Number.isNaN(step)) {
      problems.push(`${key}: step ${JSON.stringify(step)} at index ${index} is not a number`);
      return;
    }
    if (previous !== undefined && !(step > previous)) problems.push(`${key}: step ${step} at index ${index} does not increase (after ${previous})`);
    previous = step;
  });
  return problems;
}

/** Every facet of a `LATEST_STEP_FACET_KINDS` kind (any variant) whose steps are not strictly increasing. */
export function stepOrderProblems(facets: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(facets).flatMap(([key, facet]) => {
    const kind = parseFacetKey(key)?.kind;
    if (kind === undefined || !LATEST_STEP_FACET_KINDS.has(kind) || facet === undefined) return [];
    return stepListProblems(key, (facet as { steps?: unknown }).steps);
  });
}
