import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createLabStore } from './createLabStore.ts';

describe('createLabStore', () => {
  it('creates independent stores per lab', () => {
    const a = createLabStore(createFixtureBundle());
    const b = createLabStore(createFixtureBundle());
    a.getState().next();
    expect(a.getState().step).toBe(0);
    expect(b.getState().step).toBe(-1);
  });

  it('navigates with clamping', () => {
    const store = createLabStore(createFixtureBundle());
    const { next, prev, first, last, seek } = store.getState();
    last();
    expect(store.getState().step).toBe(2);
    next();
    expect(store.getState().step).toBe(2);
    first();
    prev();
    expect(store.getState().step).toBe(-1);
    seek(1);
    expect(store.getState().step).toBe(1);
  });

  it('plays, pauses, toggles and ticks', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().togglePlay();
    expect(store.getState().playing).toBe(true);
    store.getState().tick();
    expect(store.getState().step).toBe(0);
    store.getState().togglePlay();
    expect(store.getState().playing).toBe(false);
    store.getState().play();
    store.getState().pause();
    expect(store.getState().playing).toBe(false);
  });

  it('sets speed, selection and derived facets', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().setSpeed(100);
    store.getState().select('0/key');
    store.getState().setDerivedFacet('instructions@x86', { ok: true });
    expect(store.getState()).toMatchObject({ speed: 4, selection: { valueRefId: '0/key' }, derivedFacets: { 'instructions@x86': { ok: true } } });
  });

  it('setBundle resets the lab but keeps speed', () => {
    const store = createLabStore(null);
    expect(store.getState().stepCount).toBe(0);
    store.getState().setSpeed(2);
    store.getState().setBundle(createFixtureBundle());
    expect(store.getState()).toMatchObject({ stepCount: 3, step: -1, speed: 2 });
  });
});
