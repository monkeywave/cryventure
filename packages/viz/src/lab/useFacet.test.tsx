import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DeriverManifest, TraceBundle } from '@cryventure/core';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createLabStore, type LabStore } from './createLabStore.ts';
import { LabProvider } from './LabContext.tsx';
import { defaultVariant, facetVariants, lookupFacet, useFacet, useFacetVariants } from './useFacet.ts';

const wrapperFor = (store: LabStore, derivers?: readonly DeriverManifest[]) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LabProvider store={store} derivers={derivers}>
        {children}
      </LabProvider>
    );
  };

/** A fake deriver: `demo` from `state`, in two variants (`x86`, then `arm`), released by the test. */
function demoDeriver(overrides: Partial<DeriverManifest> = {}) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const derive = vi.fn((_bundle: TraceBundle): Record<string, unknown> => ({ 'demo@x86': { arch: 'x86' }, 'demo@arm': { arch: 'arm' } }));
  const manifest: DeriverManifest = {
    kind: 'deriver',
    id: 'demo',
    apiVersion: 1,
    from: ['state'],
    provides: ['demo'],
    load: async () => {
      await gate;
      return { derive };
    },
    ...overrides,
  };
  return { manifest, derive, release };
}

describe('lookupFacet', () => {
  const bundle = createFixtureBundle();

  it('is loading without a bundle', () => {
    expect(lookupFacet(null, {}, 'state')).toEqual({ status: 'loading', data: undefined });
  });

  it('finds bundle facets by kind and variant', () => {
    expect(lookupFacet(bundle, {}, 'state')).toMatchObject({ status: 'ready', data: { kind: 'state' } });
    expect(lookupFacet(bundle, {}, 'state', 'other').status).toBe('missing');
  });

  it('picks `default`, else the first variant, when none is asked for', () => {
    expect(lookupFacet(bundle, { 'demo@x86': 1, 'demo@arm': 2 }, 'demo')).toEqual({ status: 'ready', data: 1 });
    expect(lookupFacet(bundle, { 'demo@x86': 1, 'demo@default': 2 }, 'demo')).toEqual({ status: 'ready', data: 2 });
  });

  it('is loading while a deriver may still provide the facet', () => {
    expect(lookupFacet(bundle, {}, 'demo', undefined, true).status).toBe('loading');
    expect(lookupFacet(bundle, {}, 'demo', undefined, false).status).toBe('missing');
  });

  it('falls back to derived facets', () => {
    expect(lookupFacet(bundle, { 'memory@recorded': { m: 1 } }, 'memory', 'recorded')).toEqual({ status: 'ready', data: { m: 1 } });
  });
});

describe('useFacet', () => {
  it('reads from the lab store and reacts to derived facets', () => {
    const store = createLabStore(createFixtureBundle());
    const { result, rerender } = renderHook(() => useFacet<{ n: number }>('math'), { wrapper: wrapperFor(store) });
    expect(result.current.status).toBe('missing');
    store.getState().setDerivedFacet('math@default', { n: 1 });
    rerender();
    expect(result.current).toEqual({ status: 'ready', data: { n: 1 } });
  });

  it('throws a helpful error outside a LabProvider', () => {
    expect(() => renderHook(() => useFacet('state'))).toThrow(/LabProvider/);
  });
});

describe('facetVariants / defaultVariant', () => {
  it('lists bundle variants, then derived ones, without duplicates', () => {
    const bundle = createFixtureBundle();
    expect(facetVariants(bundle, { 'state@alt': 1, 'state@default': 2, 'demo@x': 3 }, 'state')).toEqual(['default', 'alt']);
    expect(facetVariants(null, {}, 'state')).toEqual([]);
  });

  it('prefers default, else the first', () => {
    expect(defaultVariant(['a', 'default'])).toBe('default');
    expect(defaultVariant(['a', 'b'])).toBe('a');
    expect(defaultVariant([])).toBeUndefined();
  });
});

describe('useFacet with derivers', () => {
  it('is loading while the deriver runs, then ready with the first variant', async () => {
    const store = createLabStore(createFixtureBundle());
    const { manifest, release } = demoDeriver();
    const { result } = renderHook(() => useFacet<{ arch: string }>('demo'), { wrapper: wrapperFor(store, [manifest]) });
    expect(result.current.status).toBe('loading');
    await act(async () => release());
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: { arch: 'x86' } }));
  });

  it('serves a requested variant', async () => {
    const store = createLabStore(createFixtureBundle());
    const { manifest, release } = demoDeriver();
    release();
    const { result } = renderHook(() => useFacet<{ arch: string }>('demo', 'arm'), { wrapper: wrapperFor(store, [manifest]) });
    await waitFor(() => expect(result.current.data).toEqual({ arch: 'arm' }));
  });

  it('derives once for several views of the same bundle', async () => {
    const store = createLabStore(createFixtureBundle());
    const { manifest, derive, release } = demoDeriver();
    const wrapper = wrapperFor(store, [manifest]);
    const first = renderHook(() => useFacet('demo'), { wrapper });
    const second = renderHook(() => useFacet('demo', 'arm'), { wrapper });
    await act(async () => release());
    await waitFor(() => expect([first.result.current.status, second.result.current.status]).toEqual(['ready', 'ready']));
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it('drops a result derived for a bundle the lab has replaced', async () => {
    const old = createFixtureBundle();
    const store = createLabStore(old);
    const { manifest, release } = demoDeriver({ from: ['state'], appliesTo: (bundle) => bundle === old });
    const { result } = renderHook(() => useFacet('demo'), { wrapper: wrapperFor(store, [manifest]) });
    expect(result.current.status).toBe('loading');
    act(() => store.getState().setBundle(createFixtureBundle()));
    await act(async () => release());
    expect(store.getState().derivedFacets).toEqual({});
    expect(result.current.status).toBe('missing');
  });

  it('reports missing after a failure, logged once, without retrying', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = createLabStore(createFixtureBundle());
    const load = vi.fn(() => Promise.reject(new Error('boom')));
    const { manifest } = demoDeriver({ load });
    const wrapper = wrapperFor(store, [manifest]);
    const first = renderHook(() => useFacet('demo'), { wrapper });
    const second = renderHook(() => useFacet('demo'), { wrapper });
    await waitFor(() => expect(first.result.current.status).toBe('missing'));
    await waitFor(() => expect(second.result.current.status).toBe('missing'));
    first.rerender();
    expect(load).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('is missing when no deriver applies', () => {
    const store = createLabStore(createFixtureBundle());
    const { manifest, derive } = demoDeriver({ appliesTo: () => false });
    const { result } = renderHook(() => useFacet('demo'), { wrapper: wrapperFor(store, [manifest]) });
    expect(result.current.status).toBe('missing');
    expect(derive).not.toHaveBeenCalled();
  });

  it('is missing when the deriver settles without the requested variant', async () => {
    const store = createLabStore(createFixtureBundle());
    const { manifest, release } = demoDeriver();
    release();
    const { result } = renderHook(() => useFacet('demo', 'riscv'), { wrapper: wrapperFor(store, [manifest]) });
    await waitFor(() => expect(result.current.status).toBe('missing'));
  });
});

describe('useFacetVariants', () => {
  it('lists the derived variants once derivation is done', async () => {
    const store = createLabStore(createFixtureBundle());
    const { manifest, release } = demoDeriver();
    const { result } = renderHook(() => useFacetVariants('demo'), { wrapper: wrapperFor(store, [manifest]) });
    expect(result.current).toEqual([]);
    await act(async () => release());
    await waitFor(() => expect(result.current).toEqual(['x86', 'arm']));
  });

  it('lists the bundle variants without derivers', () => {
    const store = createLabStore(createFixtureBundle());
    const { result } = renderHook(() => useFacetVariants('state'), { wrapper: wrapperFor(store) });
    expect(result.current).toEqual(['default']);
  });
});

/** Two ISA-like derivers providing the same kinds; `release` order is up to the test. */
function isaDerivers() {
  const arm = demoDeriver({ id: 'isa-arm', provides: ['demo', 'regs'] });
  const x86 = demoDeriver({ id: 'isa-x86', provides: ['demo', 'regs'] });
  arm.derive.mockImplementation(() => ({ 'demo@arm': { arch: 'arm' }, 'regs@arm': { arch: 'arm' } }));
  x86.derive.mockImplementation(() => ({ 'demo@x86': { arch: 'x86' }, 'regs@x86': { arch: 'x86' } }));
  return { arm, x86, manifests: [arm.manifest, x86.manifest] };
}

describe('variant order follows the derivers, not completion order', () => {
  it('lists variants in deriver order when the later deriver settles first', async () => {
    const store = createLabStore(createFixtureBundle());
    const { arm, x86, manifests } = isaDerivers();
    const { result } = renderHook(() => useFacetVariants('demo'), { wrapper: wrapperFor(store, manifests) });
    await act(async () => x86.release());
    await waitFor(() => expect(result.current).toEqual(['x86']));
    await act(async () => arm.release());
    await waitFor(() => expect(result.current).toEqual(['arm', 'x86']));
  });

  it('defaults to the first deriver\'s variant whatever order they settle in', async () => {
    const store = createLabStore(createFixtureBundle());
    const { arm, x86, manifests } = isaDerivers();
    const { result } = renderHook(() => useFacet<{ arch: string }>('demo'), { wrapper: wrapperFor(store, manifests) });
    await act(async () => x86.release());
    await act(async () => arm.release());
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: { arch: 'arm' } }));
  });

  it('stays loading until every candidate deriver settled when no preference matches (reversed completion)', async () => {
    const store = createLabStore(createFixtureBundle());
    const { arm, x86, manifests } = isaDerivers();
    const seen: string[] = [];
    const { result } = renderHook(
      () => {
        const facet = useFacet<{ arch: string }>('demo');
        seen.push(facet.status === 'ready' ? facet.data.arch : facet.status);
        return facet;
      },
      { wrapper: wrapperFor(store, manifests) },
    );
    await act(async () => x86.release());
    await waitFor(() => expect(store.getState().derivedFacets).toHaveProperty('demo@x86'));
    expect(result.current.status).toBe('loading');
    await act(async () => arm.release());
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: { arch: 'arm' } }));
    expect(seen).not.toContain('x86');
  });

  it('shows an exact preferred match before the other derivers settle', async () => {
    const store = createLabStore(createFixtureBundle(), { preferredVariant: 'x86' });
    const { x86, manifests } = isaDerivers();
    const { result } = renderHook(() => useFacet<{ arch: string }>('demo'), { wrapper: wrapperFor(store, manifests) });
    await act(async () => x86.release());
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: { arch: 'x86' } }));
  });

  it('writes each deriver\'s facets to the store once, however many hooks request them', async () => {
    const store = createLabStore(createFixtureBundle());
    const { arm, x86, manifests } = isaDerivers();
    const writes = vi.fn();
    store.subscribe((state, previous) => {
      if (state.derivedFacets !== previous.derivedFacets) writes();
    });
    const wrapper = wrapperFor(store, manifests);
    const useHooks = () => ({ demo: useFacet('demo'), regs: useFacet('regs'), variants: useFacetVariants('demo') });
    const first = renderHook(useHooks, { wrapper });
    await act(async () => {
      arm.release();
      x86.release();
    });
    await waitFor(() => expect(first.result.current.demo.status).toBe('ready'));
    first.unmount();
    const second = renderHook(useHooks, { wrapper });
    await waitFor(() => expect(second.result.current.regs.status).toBe('ready'));
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it('orders derived variants by the given derivers in facetVariants', () => {
    const bundle = createFixtureBundle();
    const { manifests } = isaDerivers();
    const derived = { 'demo@x86': 1, 'demo@arm': 2, 'demo@other': 3 };
    const owners = { 'demo@x86': 'isa-x86', 'demo@arm': 'isa-arm' };
    expect(facetVariants(bundle, derived, 'demo', manifests, (key) => owners[key as keyof typeof owners])).toEqual(['arm', 'x86', 'other']);
  });
});

