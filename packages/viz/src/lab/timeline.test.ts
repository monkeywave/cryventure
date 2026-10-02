import { describe, expect, it } from 'vitest';
import type { TraceBundle } from '@cryventure/core';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { timelineLength } from './timeline.ts';

const bundleWith = (facets: TraceBundle['facets']): TraceBundle => ({ ...createFixtureBundle(), facets });

describe('timelineLength', () => {
  it('is 0 without a bundle or timeline facets', () => {
    expect(timelineLength(null)).toBe(0);
    expect(timelineLength(bundleWith({}))).toBe(0);
  });

  it('uses the state facet step count', () => {
    expect(timelineLength(createFixtureBundle())).toBe(3);
  });

  it('falls back to one past the last narration step', () => {
    const narration = { kind: 'narration', schemaVersion: 1, entries: [{ step: 0, ref: { key: 'a' } }, { step: 4, ref: { key: 'b' } }] };
    expect(timelineLength(bundleWith({ 'narration@default': narration }))).toBe(5);
  });
});
