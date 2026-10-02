import { describe, expect, it } from 'vitest';
import { viewsFor, type Messages } from '@cryventure/core';
import { messageParityProblems } from '@cryventure/viz/testing';
import { viewManifests } from './index.ts';

const catalogs = import.meta.glob<Messages>('./*/i18n/*.json', { eager: true, import: 'default' });
const viewFolders = [...new Set(Object.keys(catalogs).map((path) => path.split('/')[1]))];

describe('viewManifests', () => {
  it('collects every view folder, sorted by order', () => {
    const ids = viewManifests.map((view) => view.id);
    expect([...ids].sort()).toEqual([...viewFolders].sort());
    expect(ids.indexOf('state')).toBeLessThan(ids.indexOf('narration'));
  });

  it('is offered by core viewsFor according to available facets', () => {
    const coreViews = (available: string[]) => viewsFor([...viewManifests], available).map((view) => view.id).filter((id) => id === 'state' || id === 'narration');
    expect(coreViews(['state'])).toEqual(['state']);
    expect(coreViews(['state', 'narration'])).toEqual(['state', 'narration']);
  });

  it('lazy-loads a component for every view', async () => {
    const modules = await Promise.all(viewManifests.map((view) => view.load()));
    modules.forEach((module) => expect(typeof module.default).toBe('function'));
  });
});

describe('views i18n parity', () => {
  it.each(viewFolders)('%s: EN and DE match (keys, {{params}}, non-empty) under view.<id>.*', (folder) => {
    const en = catalogs[`./${folder}/i18n/en.json`] ?? {};
    const de = catalogs[`./${folder}/i18n/de.json`] ?? {};
    expect(messageParityProblems(en, de)).toEqual([]);
    expect(Object.keys(en).every((key) => key.startsWith(`view.${folder}.`))).toBe(true);
  });
});
