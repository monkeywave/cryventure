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

  it('navigates by round', () => {
    const store = createLabStore(createFixtureBundle());
    const { nextRound, prevRound } = store.getState();
    nextRound();
    expect(store.getState()).toMatchObject({ step: 0, transition: 'jump' });
    nextRound();
    expect(store.getState().step).toBe(1);
    nextRound();
    expect(store.getState().step).toBe(2);
    prevRound();
    expect(store.getState().step).toBe(1);
    prevRound();
    expect(store.getState().step).toBe(0);
    prevRound();
    expect(store.getState().step).toBe(-1);
  });

  it('sets the mode and toggles breakpoints', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().setMode('story');
    expect(store.getState().mode).toBe('story');
    store.getState().toggleBreakpoint('sub');
    store.getState().toggleBreakpoint('load');
    expect(store.getState().breakpoints).toEqual(['sub', 'load']);
    store.getState().toggleBreakpoint('sub');
    expect(store.getState().breakpoints).toEqual(['load']);
    store.getState().toggleCurrentBreakpoint();
    expect(store.getState().breakpoints).toEqual(['load']);
    store.getState().seek(2);
    store.getState().toggleCurrentBreakpoint();
    expect(store.getState().breakpoints).toEqual(['load', 'mix']);
  });

  it('setBundle keeps the mode and clears breakpoints and selection', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().setMode('story');
    store.getState().toggleBreakpoint('sub');
    store.getState().selectNode({ region: 'state', index: 3 });
    store.getState().setBundle(createFixtureBundle());
    expect(store.getState()).toMatchObject({ mode: 'story', breakpoints: [], selection: { valueRefId: null, node: null } });
  });

  it('selectNode and select keep each other', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().select('0/key');
    store.getState().selectNode({ region: 'state', index: 5 });
    expect(store.getState().selection).toEqual({ valueRefId: '0/key', node: { region: 'state', index: 5 } });
    store.getState().select(null);
    expect(store.getState().selection).toEqual({ valueRefId: null, node: { region: 'state', index: 5 } });
    store.getState().selectNode(null);
    expect(store.getState().selection).toEqual({ valueRefId: null, node: null });
  });

  describe('progress playhead', () => {
    it('starts at the end state and seek shows the end state', () => {
      const store = createLabStore(createFixtureBundle());
      expect(store.getState().progress.get()).toBe(1);
      store.getState().progress.set(0.3);
      store.getState().seek(1);
      expect(store.getState().progress.get()).toBe(1);
    });

    it('story-mode next starts the step at 0', () => {
      const store = createLabStore(createFixtureBundle());
      store.getState().setMode('story');
      store.getState().next();
      expect(store.getState()).toMatchObject({ step: 0, transition: 'advance' });
      expect(store.getState().progress.get()).toBe(0);
    });

    it('pause keeps the current value', () => {
      const store = createLabStore(createFixtureBundle());
      store.getState().setMode('story');
      store.getState().next();
      store.getState().progress.set(0.4);
      store.getState().play();
      store.getState().pause();
      expect(store.getState().transition).toBe('hold');
      expect(store.getState().progress.get()).toBe(0.4);
    });
  });
});
