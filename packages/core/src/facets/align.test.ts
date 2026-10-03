import { describe, expect, it } from 'vitest';
import { alignIssues, alignShapeIssues, appliedThrough, currentAt, type AlignSpan } from './align.ts';

const span = (first: number, last: number = first): AlignSpan => ({ first, last });

/** AES on ARMv8 shape: a load at the start, aese (0..2), aesmc (3), aese (4..6), ret. */
const spans = [span(-1), span(0, 2), span(3), span(4, 6), span(6)];

describe('alignShapeIssues', () => {
  it('accepts monotonic spans with zero-width and initial entries', () => {
    expect(alignShapeIssues(spans, 'x')).toEqual([]);
    expect(alignShapeIssues([], 'x')).toEqual([]);
  });
  it('rejects ends below −1 or not integers', () => {
    expect(alignShapeIssues([span(-2, 0), span(0, 0.5)], 'x')).toEqual(['x: span 0 first -2 is not an integer ≥ -1', 'x: span 1 last 0.5 is not an integer ≥ -1']);
  });
  it('rejects first > last', () => {
    expect(alignShapeIssues([span(3, 1)], 'x')).toEqual(['x: span 0 first 3 > last 1']);
  });
  it('rejects decreasing first or last', () => {
    expect(alignShapeIssues([span(2, 5), span(1, 4)], 'x')).toEqual(['x: span 1 first 1 decreases (after 2)', 'x: span 1 last 4 decreases (after 5)']);
  });
});

describe('alignIssues', () => {
  it('accepts spans within the step count', () => expect(alignIssues(spans, 7)).toEqual([]));
  it('rejects ends past stepCount − 1', () => {
    expect(alignIssues(spans, 6)).toEqual(['align: span 3 last 6 outside -1..5', 'align: span 4 first 6 outside -1..5', 'align: span 4 last 6 outside -1..5']);
  });
  it('includes shape problems', () => expect(alignIssues([span(1, 0)], 3)).toEqual(['align: span 0 first 1 > last 0']));
});

describe('currentAt', () => {
  it('returns the step whose span contains the playhead', () => {
    expect(currentAt(spans, 1)).toBe(1);
    expect(currentAt(spans, 3)).toBe(2);
  });
  it('returns the last match when spans share a step', () => {
    expect(currentAt(spans, -1)).toBe(0);
    expect(currentAt(spans, 6)).toBe(4);
  });
  it('returns undefined when nothing is current', () => {
    expect(currentAt(spans, 7)).toBeUndefined();
    expect(currentAt([], 0)).toBeUndefined();
    expect(currentAt([span(2)], 1)).toBeUndefined();
  });
});

describe('appliedThrough', () => {
  it('returns the last step whose effects are visible (last ≤ p)', () => {
    expect(appliedThrough(spans, -1)).toBe(0);
    expect(appliedThrough(spans, 1)).toBe(0);
    expect(appliedThrough(spans, 2)).toBe(1);
    expect(appliedThrough(spans, 6)).toBe(4);
  });
  it('returns −1 when no step has applied', () => {
    expect(appliedThrough([span(0, 2)], 1)).toBe(-1);
    expect(appliedThrough([], 5)).toBe(-1);
  });
});
