import { alignShapeIssues } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import { INITIAL_SPAN } from '../isaSpans.ts';
import { syntheticPermutation } from './fixtures/keccakChecks.ts';
import { naturalSpan, resolveSpans } from './keccakSpans.ts';

const permutation = syntheticPermutation();
const round = permutation.rounds[0]!; // θ 2, ρ 3, π 4, χ 5, ι 6
const point = (step: number) => ({ first: step, last: step });

describe('naturalSpan', () => {
  it('puts each Keccak instruction on its round steps, loads on entry and stores on exit', () => {
    expect(naturalSpan('thetaParity', permutation, round)).toEqual(point(2));
    expect(naturalSpan('thetaD', permutation, round)).toEqual(point(2));
    expect(naturalSpan('thetaRhoPi', permutation, round)).toEqual({ first: 2, last: 4 });
    expect(naturalSpan('chi', permutation, round)).toEqual(point(5));
    expect(naturalSpan('iota', permutation, round)).toEqual(point(6));
    expect(naturalSpan('loadState', permutation, undefined)).toEqual(point(1));
    expect(naturalSpan('storeState', permutation, undefined)).toEqual(point(122));
  });

  it('gives moves, the loop, the RC load and other bookkeeping none', () => {
    for (const role of ['loadRc', 'loop', 'other'] as const)
      expect(naturalSpan(role, permutation, round)).toBeUndefined();
  });
});

describe('resolveSpans', () => {
  const xar = { first: 2, last: 4 };

  it('defers an xar scheduled after χ began to zero-width at χ (never backwards)', () => {
    const spans = resolveSpans([xar, point(5), xar, point(5)], INITIAL_SPAN);
    expect(spans).toEqual([xar, point(5), point(5), point(5)]);
  });

  it('places bookkeeping between its neighbours: θ … π between two xar, else zero-width at the next first', () => {
    const spans = resolveSpans(
      [
        undefined,
        point(1),
        point(2),
        undefined,
        xar,
        undefined,
        xar,
        point(5),
        undefined,
        point(5),
        point(6),
        undefined,
      ],
      INITIAL_SPAN,
    );
    expect(spans).toEqual([
      point(1),
      point(1),
      point(2),
      point(2),
      xar,
      xar,
      xar,
      point(5),
      point(5),
      point(5),
      point(6),
      point(6),
    ]);
  });

  it('reports a natural span that runs backwards (a broken trace) instead of raising it into shape', () => {
    // θ … π with θ after π: raising it to the floor {7, 7} would turn it into a plausible point(7).
    expect(() => resolveSpans([point(7), { first: 6, last: 4 }], INITIAL_SPAN)).toThrow(
      'Keccak trace contract: instruction 1 has a span from step 6 back to step 4',
    );
  });

  it('starts at the span before the run and keeps bookkeeping after the last instruction there', () => {
    expect(resolveSpans([undefined, undefined], point(122))).toEqual([point(122), point(122)]);
  });

  it('never decreases on a whole listing run', () => {
    const natural = [
      point(1),
      ...Array.from({ length: 24 }, (_, r) => {
        const steps = permutation.rounds[r]!;
        return [
          point(steps.theta.step),
          undefined,
          { first: steps.theta.step, last: steps.pi.step },
          point(steps.chi.step),
          undefined,
          { first: steps.theta.step, last: steps.pi.step },
          point(steps.iota.step),
          undefined,
        ];
      }).flat(),
      point(122),
    ];
    expect(alignShapeIssues(resolveSpans(natural, INITIAL_SPAN), 'align')).toEqual([]);
  });
});
