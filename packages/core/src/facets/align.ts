import { INITIAL_STEP_INDEX, isStepIndex } from './validation.ts';

/**
 * Alignment of a derived facet's own steps (instructions, register writes, memory writes) to the
 * producer's state steps (docs/M4.md §1e). At playhead p, step i is *current* iff
 * `first ≤ p ≤ last`, and its effects are *visible* iff `p ≥ last`.
 */

/** Inclusive range of state steps one derived step covers; −1 = the initial state. */
export interface AlignSpan {
  first: number;
  last: number;
}

function spanEndIssues(span: AlignSpan, index: number, where: string): string[] {
  return (['first', 'last'] as const)
    .filter((end) => !isStepIndex(span[end]))
    .map((end) => `${where}: span ${index} ${end} ${span[end]} is not an integer ≥ ${INITIAL_STEP_INDEX}`);
}

function spanOrderIssues(span: AlignSpan, previous: AlignSpan | undefined, index: number, where: string): string[] {
  const issues: string[] = [];
  if (span.first > span.last) issues.push(`${where}: span ${index} first ${span.first} > last ${span.last}`);
  if (previous === undefined) return issues;
  for (const end of ['first', 'last'] as const) {
    if (span[end] < previous[end]) issues.push(`${where}: span ${index} ${end} ${span[end]} decreases (after ${previous[end]})`);
  }
  return issues;
}

/**
 * Shape problems of a span sequence, independent of the step count (empty = valid): integer ends
 * ≥ −1, `first ≤ last`, and neither end decreasing. `where` prefixes each message.
 */
export function alignShapeIssues(spans: AlignSpan[], where: string): string[] {
  return spans.flatMap((span, index) => [...spanEndIssues(span, index, where), ...spanOrderIssues(span, spans[index - 1], index, where)]);
}

function spanRangeIssues(spans: AlignSpan[], stepCount: number): string[] {
  return spans.flatMap((span, index) =>
    (['first', 'last'] as const)
      .filter((end) => span[end] > stepCount - 1)
      .map((end) => `align: span ${index} ${end} ${span[end]} outside -1..${stepCount - 1}`),
  );
}

/** Problems of a span sequence against `stepCount` state steps (empty = valid): shape, plus both ends in `[-1, stepCount − 1]`. */
export function alignIssues(spans: AlignSpan[], stepCount: number): string[] {
  return [...alignShapeIssues(spans, 'align'), ...spanRangeIssues(spans, stepCount)];
}

/** Index of the step current at playhead `p` (`first ≤ p ≤ last`; the last match), or `undefined`. */
export function currentAt(spans: AlignSpan[], p: number): number | undefined {
  const index = spans.findLastIndex((span) => span.first <= p && p <= span.last);
  return index === -1 ? undefined : index;
}

/** Index of the last step whose effects are visible at playhead `p` (`last ≤ p`), or −1 if none. */
export function appliedThrough(spans: AlignSpan[], p: number): number {
  return spans.findLastIndex((span) => span.last <= p);
}
