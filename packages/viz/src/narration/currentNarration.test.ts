import { describe, expect, it } from 'vitest';
import type { NarrationFacet } from '@cryventure/core';
import { INITIAL_STEP } from '../lab/labReducers.ts';
import { currentNarrationRef, NARRATION_KEYS } from './currentNarration.ts';

const facet: NarrationFacet = { kind: 'narration', schemaVersion: 1, entries: [{ step: 0, ref: { key: 'step.zero' } }] };
const ready = { status: 'ready', data: facet } as const;

describe('currentNarrationRef', () => {
  it('hints at the initial state before the first step', () => {
    expect(currentNarrationRef({ facet: ready, step: INITIAL_STEP })).toEqual({ key: NARRATION_KEYS.initial });
  });
  it("shows the producer's initial narration (step −1) when it has one", () => {
    const withInitial: NarrationFacet = { ...facet, entries: [{ step: INITIAL_STEP, ref: { key: 'plugin.x.initial', params: { a: '{57}' } } }, ...facet.entries] };
    const data = { status: 'ready', data: withInitial } as const;
    expect(currentNarrationRef({ facet: data, step: INITIAL_STEP })).toEqual({ key: 'plugin.x.initial', params: { a: '{57}' } });
    expect(currentNarrationRef({ facet: data, step: 0 })).toEqual({ key: 'step.zero' });
  });

  it('narrates the current step', () => {
    expect(currentNarrationRef({ facet: ready, step: 0 })).toEqual({ key: 'step.zero' });
  });

  it('prefers the active beat over the step narration', () => {
    expect(currentNarrationRef({ facet: ready, step: 0, beatNarration: { key: 'beat' } })).toEqual({ key: 'beat' });
  });

  it('falls back when the step has no entry or the lab has no narration', () => {
    expect(currentNarrationRef({ facet: ready, step: 5 })).toEqual({ key: NARRATION_KEYS.none });
    expect(currentNarrationRef({ facet: { status: 'missing', data: undefined }, step: INITIAL_STEP })).toEqual({ key: NARRATION_KEYS.missing });
    expect(currentNarrationRef({ facet: { status: 'loading', data: undefined }, step: 0 })).toEqual({ key: NARRATION_KEYS.none });
  });
});
