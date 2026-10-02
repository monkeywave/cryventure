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
