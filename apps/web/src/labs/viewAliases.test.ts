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

  });

  it('does nothing without storage (null), and never throws on a storage that throws', () => {
    const aliased = JSON.stringify({ version: 1, panelIds: ['key-schedule'], sizes: { 'key-schedule': 100 } });
    localStorage.setItem(KEY, aliased);
    expect(() => migrateStoredLayout('aes-key-schedule', null)).not.toThrow();
    expect(localStorage.getItem(KEY)).toBe(aliased);

    const throwing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    expect(() => migrateStoredLayout('aes-key-schedule', throwing)).not.toThrow();
    const failingWrite = { getItem: () => aliased, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => migrateStoredLayout('aes-key-schedule', failingWrite)).not.toThrow();
  });

  it('migrates size keys still naming a former id even when the panel ids are current; the current id wins a clash', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, panelIds: ['state', 'derivation'], sizes: { state: 60, 'key-schedule': 40 } }));
    migrateStoredLayout('aes-key-schedule');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ version: 1, panelIds: ['state', 'derivation'], sizes: { state: 60, derivation: 40 } });

    localStorage.setItem(KEY, JSON.stringify({ version: 1, panelIds: ['state', 'derivation'], sizes: { derivation: 30, 'key-schedule': 40, state: 70 } }));
    migrateStoredLayout('aes-key-schedule');
    expect(JSON.parse(localStorage.getItem(KEY)!).sizes).toEqual({ derivation: 30, state: 70 });
  });
});
