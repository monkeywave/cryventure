import { describe, expect, it } from 'vitest';
import { narrationAt, narrationFromState, type NarrationFacet } from './narration.ts';

const facet: NarrationFacet = {
  kind: 'narration',
  schemaVersion: 1,
  entries: [
    { step: 0, ref: { key: 'a' } },
    { step: 2, ref: { key: 'c', params: { n: 1 } } },
  ],
};

describe('narrationAt', () => {
  it('returns the ref for a step', () => {
    expect(narrationAt(facet, 2)).toEqual({ key: 'c', params: { n: 1 } });
  });
  it('returns undefined when the step has no narration', () => {
    expect(narrationAt(facet, 1)).toBeUndefined();
    expect(narrationAt(facet, -1)).toBeUndefined();
  });
});

describe('narrationAt on sparse and dense facets', () => {
  const sparse: NarrationFacet = {
    kind: 'narration',
    schemaVersion: 1,
    entries: [1, 4, 5, 9, 20].map((step) => ({ step, ref: { key: `s${step}` } })),
  };
  it('finds every recorded step by binary search and nothing in between', () => {
    for (let step = -1; step <= 21; step++) {
      const expected = sparse.entries.some((entry) => entry.step === step) ? { key: `s${step}` } : undefined;
      expect(narrationAt(sparse, step)).toEqual(expected);
    }
  });
  it('reads dense entries by index', () => {
    const dense: NarrationFacet = { kind: 'narration', schemaVersion: 1, entries: [0, 1, 2].map((step) => ({ step, ref: { key: `d${step}` } })) };
    expect([0, 1, 2, 3].map((step) => narrationAt(dense, step)?.key)).toEqual(['d0', 'd1', 'd2', undefined]);
  });
});

describe('narrationFromState', () => {
  it('maps each state step to an entry', () => {
    const step = (key: string) => ({ op: 'x', scope: [], writes: [], highlights: [], narration: { key } });
    const derived = narrationFromState({ steps: [step('s0'), step('s1')] });
    expect(derived).toEqual({
      kind: 'narration',
      schemaVersion: 1,
      entries: [
        { step: 0, ref: { key: 's0' } },
        { step: 1, ref: { key: 's1' } },
      ],
    });
    expect(narrationAt(derived, 1)).toEqual({ key: 's1' });
  });
});
