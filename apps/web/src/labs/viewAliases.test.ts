// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { migrateStoredLayout, resolveLayoutAliases, resolveViewId, VIEW_ID_ALIASES } from './viewAliases.ts';

const KEY = 'cv.layout.v1.aes-key-schedule';

afterEach(() => localStorage.clear());

describe('view id aliases', () => {
  it('maps the former key-schedule view to derivation and passes other ids through', () => {
    expect(VIEW_ID_ALIASES).toEqual({ 'key-schedule': 'derivation' });
    expect(resolveViewId('key-schedule')).toBe('derivation');
    expect(resolveViewId('state')).toBe('state');
    expect(resolveViewId('toString')).toBe('toString');
  });

  it('rewrites aliased ids in a layout preset and keeps the sizes', () => {
    expect(resolveLayoutAliases('state:55|key-schedule:45')).toBe('state:55|derivation:45');
    expect(resolveLayoutAliases(' key-schedule |narration')).toBe('derivation|narration');
    expect(resolveLayoutAliases('state|narration')).toBe('state|narration');
    expect(resolveLayoutAliases(undefined)).toBeUndefined();
  });

  it('migrates saved panel sizes that name a former view id', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, panelIds: ['state', 'key-schedule'], sizes: { state: 60, 'key-schedule': 40 } }));
    migrateStoredLayout('aes-key-schedule');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ version: 1, panelIds: ['state', 'derivation'], sizes: { state: 60, derivation: 40 } });
  });

  it('leaves current, missing and corrupt entries untouched', () => {
    const current = JSON.stringify({ version: 1, panelIds: ['state', 'derivation'], sizes: { state: 60, derivation: 40 } });
    localStorage.setItem(KEY, current);
    migrateStoredLayout('aes-key-schedule');
    expect(localStorage.getItem(KEY)).toBe(current);

    localStorage.setItem(KEY, '{not json');
    expect(() => migrateStoredLayout('aes-key-schedule')).not.toThrow();
    expect(localStorage.getItem(KEY)).toBe('{not json');

    expect(() => migrateStoredLayout('other-lab', undefined)).not.toThrow();
    expect(localStorage.getItem('cv.layout.v1.other-lab')).toBeNull();
  });
});
