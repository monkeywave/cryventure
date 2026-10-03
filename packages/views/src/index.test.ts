import { describe, expect, it } from 'vitest';
import { viewsFor, type Messages } from '@cryventure/core';
import { viewManifests } from './index.ts';

const catalogs = import.meta.glob<Messages>('./*/i18n/*.json', { eager: true, import: 'default' });
// `_lib` holds helpers shared by the views (plugins never import each other), not a view.
const viewFolders = [...new Set(Object.keys(catalogs).map((path) => path.split('/')[1]))].filter((folder) => folder !== '_lib');

describe('viewManifests', () => {
  it('collects every view folder', () => {
    expect(viewManifests.map((view) => view.id).sort()).toEqual([...viewFolders].sort());
  });

  it('marks the narration view as replaced by the caption on narrow labs', () => {
    expect(viewManifests.find((view) => view.id === 'narration')?.narrowPlacement).toBe('caption');
    expect(viewManifests.find((view) => view.id === 'state')?.narrowPlacement).toBeUndefined();
  });

  it('declares every lens for the lens-dependent math view, so the contract kit renders all three', () => {
    expect(viewManifests.find((view) => view.id === 'math')?.lenses).toEqual(['story', 'engineer', 'cryptographer']);
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
