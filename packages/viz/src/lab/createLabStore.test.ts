import { describe, expect, it, vi } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createLabStore } from './createLabStore.ts';
import { selectStepCount } from './labReducers.ts';

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
    store.getState().setDerivedFacets(store.getState().bundle!, { 'instructions@x86': { ok: true } });
    expect(store.getState()).toMatchObject({ speed: 4, selection: { valueRefId: '0/key' }, derivedFacets: { 'instructions@x86': { ok: true } } });
  });

  it('remembers expanded regions per lab store, across new bundles', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().setRegionExpanded('w', true);
    store.getState().setBundle(createFixtureBundle());
    expect(store.getState().regionsExpanded).toEqual({ w: true });
    expect(createLabStore(createFixtureBundle()).getState().regionsExpanded).toEqual({});
  });

  it('setBundle resets the lab but keeps speed', () => {
    const store = createLabStore(null);
    expect(selectStepCount(store.getState())).toBe(0);
    store.getState().setSpeed(2);
    store.getState().setBundle(createFixtureBundle());
    expect(store.getState()).toMatchObject({ step: -1, speed: 2 });
    expect(selectStepCount(store.getState())).toBe(3);
    expect(store.getState()).not.toHaveProperty('stepCount');
  });

  it('navigates by round', () => {
    const store = createLabStore(createFixtureBundle());
    const { nextScope, prevScope } = store.getState();
    nextScope();
    expect(store.getState()).toMatchObject({ step: 0, transition: 'jump' });
    nextScope();
    expect(store.getState().step).toBe(1);
    nextScope();
    expect(store.getState().step).toBe(2);
    prevScope();
    expect(store.getState().step).toBe(1);
    prevScope();
    expect(store.getState().step).toBe(0);
    prevScope();
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

  it('setBundle with preserveDebugContext keeps breakpoints and the watched node the new bundle still has', () => {
    const store = createLabStore(createFixtureBundle());
    store.getState().toggleBreakpoint('sub');
    store.getState().selectNode({ region: 'state', index: 3 });
    store.getState().setBundle(createFixtureBundle(), { preserveDebugContext: true });
    expect(store.getState()).toMatchObject({ breakpoints: ['sub'], selection: { node: { region: 'state', index: 3 } } });
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

describe('createLabStore setDerivedFacets', () => {
  it('adds batches of facets for the current bundle, keeping earlier ones', () => {
    const bundle = createFixtureBundle();
    const store = createLabStore(bundle);
    store.getState().setDerivedFacets(bundle, { 'demo@a': 1 });
    store.getState().setDerivedFacets(bundle, { 'demo@b': 2, 'demo@c': 3 });
    expect(store.getState().derivedFacets).toEqual({ 'demo@a': 1, 'demo@b': 2, 'demo@c': 3 });
  });

  it('drops facets derived for a bundle the store has replaced', () => {
    const old = createFixtureBundle();
    const store = createLabStore(old);
    store.getState().setBundle(createFixtureBundle());
    store.getState().setDerivedFacets(old, { 'demo@a': 1 });
    expect(store.getState().derivedFacets).toEqual({});
  });

  it('does not notify subscribers when the same facets are written again', () => {
    const bundle = createFixtureBundle();
    const store = createLabStore(bundle);
    const facets = { 'demo@a': { n: 1 } };
    store.getState().setDerivedFacets(bundle, facets);
    const derived = store.getState().derivedFacets;
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setDerivedFacets(bundle, facets);
    store.getState().setDerivedFacets(createFixtureBundle(), facets);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().derivedFacets).toBe(derived);
  });
});

describe('createLabStore setDerivedFacets across bundles', () => {
  it('writes for whichever bundle is current, again after a new bundle', () => {
    const bundle = createFixtureBundle();
    const store = createLabStore(bundle);
    store.getState().setDerivedFacets(bundle, { 'demo@a': 1 });
    const next = createFixtureBundle();
    store.getState().setBundle(next);
    expect(store.getState().derivedFacets).toEqual({});
    store.getState().setDerivedFacets(next, { 'demo@a': 3 });
    expect(store.getState().derivedFacets).toEqual({ 'demo@a': 3 });
    store.getState().setBundle(bundle);
    store.getState().setDerivedFacets(bundle, { 'demo@a': 1 });
    expect(store.getState().derivedFacets).toEqual({ 'demo@a': 1 });
  });
});

describe('createLabStore requestParams', () => {
  it('forwards the patch to the installed handler', () => {
    const store = createLabStore(createFixtureBundle());
    const handler = vi.fn();
    store.getState().setParamsRequestHandler(handler);
    store.getState().requestParams({ keyHex: '00' });
    expect(handler).toHaveBeenCalledWith({ keyHex: '00' });
  });

  it('is a safe no-op when no host is wired or the handler was removed', () => {
    const store = createLabStore(createFixtureBundle());
    expect(() => store.getState().requestParams({ a: 1 })).not.toThrow();
    const handler = vi.fn();
    store.getState().setParamsRequestHandler(handler);
    store.getState().setParamsRequestHandler(undefined);
    store.getState().requestParams({ a: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('swapping the handler does not notify subscribers', () => {
    const store = createLabStore(createFixtureBundle());
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setParamsRequestHandler(vi.fn());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createLabStore labHref', () => {
  it('is absent when the host wires no link builder', () => {
    expect(createLabStore(createFixtureBundle()).getState().labHref).toBeUndefined();
  });

  it('exposes the host link builder and keeps it across a new bundle', () => {
    const labHref = vi.fn((producerId: string) => `/en/lab/${producerId}/`);
    const store = createLabStore(createFixtureBundle(), { labHref });
    store.getState().setBundle(createFixtureBundle(), { preserveDebugContext: true });
    expect(store.getState().labHref?.('aes', { keyHex: '00' }, 3)).toBe('/en/lab/aes/');
    expect(labHref).toHaveBeenCalledWith('aes', { keyHex: '00' }, 3);
  });
});

describe('createLabStore blockLabHref', () => {
  it('is absent without a host builder and exposes the given one', () => {
    expect(createLabStore(createFixtureBundle()).getState().blockLabHref).toBeUndefined();
    const blockLabHref = vi.fn((producerId: string, keyHex: string, blockHex: string) => `/en/lab/${producerId}/#${keyHex}${blockHex}`);
    expect(createLabStore(createFixtureBundle(), { blockLabHref }).getState().blockLabHref?.('aes', '00', 'ff')).toBe('/en/lab/aes/#00ff');
  });
});
