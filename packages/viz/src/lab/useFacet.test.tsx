import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createLabStore, type LabStore } from './createLabStore.ts';
import { LabProvider } from './LabContext.tsx';
import { lookupFacet, useFacet } from './useFacet.ts';

const wrapperFor = (store: LabStore) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <LabProvider store={store}>{children}</LabProvider>;
  };

describe('lookupFacet', () => {
  const bundle = createFixtureBundle();

  it('is loading without a bundle', () => {
    expect(lookupFacet(null, {}, 'state')).toEqual({ status: 'loading', data: undefined });
  });

  it('finds bundle facets by kind and variant', () => {
    expect(lookupFacet(bundle, {}, 'state')).toMatchObject({ status: 'ready', data: { kind: 'state' } });
    expect(lookupFacet(bundle, {}, 'state', 'other').status).toBe('missing');
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
