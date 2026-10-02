import { describe, expect, it } from 'vitest';
import { createTranslator, getFacet, type StateFacet } from '@cryventure/core';
import { vizMessages } from '../i18n/messages.ts';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { formatScopePath, scopeAt } from './scopeLabel.ts';

const t = createTranslator(vizMessages.en);

describe('formatScopePath', () => {
  it('formats round (index) and op (ordinal) levels', () => {
    expect(formatScopePath([3, 1], t)).toBe('Round 3 · op 2');
  });

  it('reuses the last level key for deeper scopes and is empty at the root', () => {
    expect(formatScopePath([0, 0, 4, 5], t)).toBe('Round 0 · op 1 · step 5 · step 6');
    expect(formatScopePath([], t)).toBe('');
    expect(formatScopePath([1], t, [])).toBe('');
  });

  it('is translated', () => {
    expect(formatScopePath([3, 1], createTranslator(vizMessages.de))).toBe('Runde 3 · Operation 2');
  });
});

describe('scopeAt', () => {
  const facet = getFacet<StateFacet<string, { op: string }>>(createFixtureBundle(), 'state');

  it('returns the recorded scope of a step and [] for the initial state or no facet', () => {
    expect(scopeAt(facet, 2)).toEqual([1, 1]);
    expect(scopeAt(facet, -1)).toEqual([]);
    expect(scopeAt(undefined, 0)).toEqual([]);
  });
});
