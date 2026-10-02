import { describe, expect, it } from 'vitest';
import { createTranslator, getFacet, type StateFacet } from '@cryventure/core';
import { vizMessages } from '../i18n/messages.ts';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { formatScopePath, scopeAt, scopeLevelKeys, scopeParams } from './scopeLabel.ts';

const t = createTranslator(vizMessages.en);
const LEVEL_KEYS = ['ui.scope.round', 'ui.scope.op', 'ui.scope.sub'];

describe('formatScopePath', () => {
  it('formats round (index) and op (ordinal) levels', () => {
    expect(formatScopePath([3, 1], t, LEVEL_KEYS)).toBe('Round 3 · op 2');
  });

  it('reuses the last level key for deeper scopes and is empty at the root', () => {
    expect(formatScopePath([0, 0, 4, 5], t, LEVEL_KEYS)).toBe('Round 0 · op 1 · step 5 · step 6');
    expect(formatScopePath([], t, LEVEL_KEYS)).toBe('');
    expect(formatScopePath([1], t, [])).toBe('');
  });

  it('is translated', () => {
    expect(formatScopePath([3, 1], createTranslator(vizMessages.de), LEVEL_KEYS)).toBe('Runde 3 · Teilschritt 2');
  });
});

describe('formatScopePath with a deepest-level label', () => {
  const keys = ['p.round', 'p.op'];
  const producerT = createTranslator({ ...vizMessages.en, 'p.round': 'Round {{value}}', 'p.op': 'Operation {{ordinal}}' });

  it('replaces the deepest declared level with the label', () => {
    expect(formatScopePath([1, 1], producerT, keys, 'SubBytes')).toBe('Round 1 · SubBytes');
  });

  it('keeps shallower scopes and missing labels on their templates', () => {
    expect(formatScopePath([3], producerT, keys, 'Whole round')).toBe('Round 3');
    expect(formatScopePath([1, 1], producerT, keys, undefined)).toBe('Round 1 · Operation 2');
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

describe('scopeParams', () => {
  it('exposes index/ordinal for the viz defaults and value/n (1-based level) for producer templates', () => {
    expect(scopeParams(3, 0)).toEqual({ index: 3, ordinal: 4, value: 3, n: 1 });
    expect(scopeParams(0, 2)).toEqual({ index: 0, ordinal: 1, value: 0, n: 3 });
  });
});

describe('scopeLevelKeys', () => {
  it("uses the producer's scopeLevels label keys when declared", () => {
    expect(scopeLevelKeys({ scopeLevels: [{ labelKey: 'p.round' }, { labelKey: 'p.op' }] })).toEqual(['p.round', 'p.op']);
  });

  it('declares no levels without (or with empty) scopeLevels, so no "Round n" is invented', () => {
    expect(scopeLevelKeys(undefined)).toEqual([]);
    expect(scopeLevelKeys({})).toEqual([]);
    expect(scopeLevelKeys({ scopeLevels: [] })).toEqual([]);
    expect(formatScopePath([0], createTranslator(vizMessages.en), scopeLevelKeys({}))).toBe('');
  });

  it('formats producer templates with {{value}} (scope index) and {{n}} (1-based level)', () => {
    const producerT = createTranslator({ ...vizMessages.en, 'p.round': 'R{{value}} (level {{n}})', 'p.op': 'op {{value}} (level {{n}})' });
    const keys = scopeLevelKeys({ scopeLevels: [{ labelKey: 'p.round' }, { labelKey: 'p.op' }] });
    expect(formatScopePath([3, 1], producerT, keys)).toBe('R3 (level 1) · op 1 (level 2)');
    expect(formatScopePath([3, 1, 7], producerT, keys)).toBe('R3 (level 1) · op 1 (level 2) · op 7 (level 3)');
  });
});
