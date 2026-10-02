import { describe, expect, it } from 'vitest';
import { defaultPanelSizes, parseLayoutEntries, parseLayoutPreset, planPanels } from './planPanels.ts';

describe('parseLayoutPreset', () => {
  it('splits, trims and dedupes', () => {
    expect(parseLayoutPreset(' state | narration|state||')).toEqual(['state', 'narration']);
    expect(parseLayoutPreset(undefined)).toEqual([]);
  });
});

describe('planPanels', () => {
  const ids = ['state', 'narration', 'memory', 'packets'];

  it('follows the preset and tabs the rest into the last panel', () => {
    expect(planPanels(ids, 'narration|state')).toEqual([
      { id: 'narration', viewIds: ['narration'] },
      { id: 'state', viewIds: ['state', 'memory', 'packets'] },
    ]);
  });

  it('ignores unknown preset ids and caps the panel count', () => {
    expect(planPanels(ids, 'nope|state|narration|memory|packets', 2).map((p) => p.id)).toEqual(['state', 'narration']);
  });

  it('defaults to the first two views', () => {
    expect(planPanels(ids)).toEqual([
      { id: 'state', viewIds: ['state'] },
      { id: 'narration', viewIds: ['narration', 'memory', 'packets'] },
    ]);
  });

  it('handles one or zero views', () => {
    expect(planPanels(['state'])).toEqual([{ id: 'state', viewIds: ['state'] }]);
    expect(planPanels([], 'state')).toEqual([]);
  });
});

describe('parseLayoutEntries', () => {
  it('reads optional sizes per entry', () => {
    expect(parseLayoutEntries('state:60| narration : 40 |memory')).toEqual([
      { id: 'state', size: 60 },
      { id: 'narration', size: 40 },
      { id: 'memory' },
    ]);
  });

  it('ignores invalid sizes and drops empty or duplicate ids', () => {
    expect(parseLayoutEntries('state:abc|narration:0|memory:150|:20|state:30|x:')).toEqual([{ id: 'state' }, { id: 'narration' }, { id: 'memory' }, { id: 'x' }]);
    expect(parseLayoutEntries(undefined)).toEqual([]);
  });

  it('keeps parseLayoutPreset returning ids only', () => {
    expect(parseLayoutPreset('state:60|narration:40')).toEqual(['state', 'narration']);
  });
});

describe('planPanels with sizes', () => {
  it('carries preset sizes into the plans', () => {
    expect(planPanels(['state', 'narration', 'memory'], 'state:60|narration:40')).toEqual([
      { id: 'state', viewIds: ['state'], defaultSize: 60 },
      { id: 'narration', viewIds: ['narration', 'memory'], defaultSize: 40 },
    ]);
  });
});

describe('defaultPanelSizes', () => {
  it('normalises complete presets to 100 percent', () => {
    expect(defaultPanelSizes(planPanels(['state', 'narration'], 'state:3|narration:1'))).toEqual({ state: 75, narration: 25 });
    expect(defaultPanelSizes(planPanels(['state', 'narration'], 'state:60|narration:40'))).toEqual({ state: 60, narration: 40 });
  });

  it('is undefined when any panel lacks a size or there are no panels', () => {
    expect(defaultPanelSizes(planPanels(['state', 'narration'], 'state:60|narration'))).toBeUndefined();
    expect(defaultPanelSizes([])).toBeUndefined();
  });
});
