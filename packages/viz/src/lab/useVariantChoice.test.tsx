import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createLabStore, type LabStore } from './createLabStore.ts';
import { LabProvider } from './LabContext.tsx';
import { preferredVariant, useFacet } from './useFacet.ts';
import { useVariantChoice } from './useVariantChoice.ts';

const wrapperFor = (store: LabStore) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <LabProvider store={store}>{children}</LabProvider>;
  };

/** Instructions and registers share variant names; memory has its own. */
function isaStore(options: Parameters<typeof createLabStore>[1] = {}) {
  const store = createLabStore(createFixtureBundle(), options);
  store.getState().setDerivedFacets(store.getState().bundle!, {
    'instructions@arm': 'arm listing',
    'instructions@x86': 'x86 listing',
    'registers@arm': 'arm registers',
    'registers@x86': 'x86 registers',
    'memory@arm+ref': 'arm memory',
    'memory@x86+ref': 'x86 memory',
  });
  return store;
}

function useTwoViews() {
  return {
    instructions: useVariantChoice('instructions'),
    registers: useVariantChoice('registers'),
    memory: useVariantChoice('memory'),
  };
}

describe('useVariantChoice', () => {
  it('lists the variants and shows the first one without a preference', () => {
    const { result } = renderHook(useTwoViews, { wrapper: wrapperFor(isaStore()) });
    expect(result.current.instructions.variants).toEqual(['arm', 'x86']);
    expect(result.current.instructions.current).toBe('arm');
    expect(result.current.registers.current).toBe('arm');
  });

  it('choosing in one view switches every view with that variant, and others to the closest name', () => {
    const { result } = renderHook(useTwoViews, { wrapper: wrapperFor(isaStore()) });
    act(() => result.current.instructions.choose('x86'));
    expect(result.current.instructions.current).toBe('x86');
    expect(result.current.registers.current).toBe('x86');
    expect(result.current.memory.current).toBe('x86+ref');
  });

  it('keeps earlier preferences for kinds the latest choice does not name', () => {
    const { result } = renderHook(useTwoViews, { wrapper: wrapperFor(isaStore()) });
    act(() => result.current.instructions.choose('x86'));
    act(() => result.current.memory.choose('x86+ref'));
    expect(result.current.registers.current).toBe('x86');
    expect(result.current.memory.current).toBe('x86+ref');
  });

  it('makes useFacet without a variant follow the preference', () => {
    const store = isaStore();
    const { result } = renderHook(() => ({ choice: useVariantChoice('instructions'), registers: useFacet('registers') }), { wrapper: wrapperFor(store) });
    expect(result.current.registers).toEqual({ status: 'ready', data: 'arm registers' });
    act(() => result.current.choice.choose('x86'));
    expect(result.current.registers).toEqual({ status: 'ready', data: 'x86 registers' });
  });

  it('starts from the host\'s preferred variant and keeps it across a re-run', async () => {
    const store = isaStore({ preferredVariant: 'x86' });
    const { result } = renderHook(useTwoViews, { wrapper: wrapperFor(store) });
    expect(result.current.instructions.current).toBe('x86');
    act(() => store.getState().setBundle(createFixtureBundle()));
    expect(store.getState().preferredVariants).toEqual(['x86']);
    await waitFor(() => expect(result.current.instructions.current).toBeUndefined());
  });
});

/** Real-world names: instruction and register variants are ISA ids, memory ones target triples + implementation. */
function tripleStore(options: Parameters<typeof createLabStore>[1] = {}) {
  const store = createLabStore(createFixtureBundle(), options);
  store.getState().setDerivedFacets(store.getState().bundle!, {
    'instructions@aarch64-armv8-ce': 'arm listing',
    'instructions@x86_64-aesni': 'x86 listing',
    'memory@x86_64-linux-gnu+c-ref': 'x86 c-ref memory',
    'memory@x86_64-linux-gnu+aesni': 'x86 aesni memory',
    'memory@aarch64-linux-gnu+c-ref': 'arm c-ref memory',
    'memory@aarch64-linux-gnu+armv8': 'arm armv8 memory',
  });
  return store;
}

describe('variant choice across kinds with different variant names', () => {
  it('a host preference x86_64-aesni selects the memory variant sharing most name tokens', () => {
    const { result } = renderHook(useTwoViews, { wrapper: wrapperFor(tripleStore({ preferredVariant: 'x86_64-aesni' })) });
    expect(result.current.instructions.current).toBe('x86_64-aesni');
    expect(result.current.memory.current).toBe('x86_64-linux-gnu+aesni');
  });

  it('switching instructions to aarch64-armv8-ce moves memory to aarch64-linux-gnu+armv8', () => {
    const { result } = renderHook(useTwoViews, { wrapper: wrapperFor(tripleStore({ preferredVariant: 'x86_64-aesni' })) });
    act(() => result.current.instructions.choose('aarch64-armv8-ce'));
    expect(result.current.memory.current).toBe('aarch64-linux-gnu+armv8');
    act(() => result.current.instructions.choose('x86_64-aesni'));
    expect(result.current.memory.current).toBe('x86_64-linux-gnu+aesni');
  });
});

describe('preferredVariant', () => {
  const memory = ['x86_64-linux-gnu+c-ref', 'x86_64-linux-gnu+aesni', 'aarch64-linux-gnu+c-ref', 'aarch64-linux-gnu+armv8'];

  it('prefers an exact match of any preference over a token match', () => {
    expect(preferredVariant(memory, ['aarch64-armv8-ce', 'x86_64-linux-gnu+c-ref'])).toBe('x86_64-linux-gnu+c-ref');
  });

  it('otherwise picks the most shared tokens with the most recent preference', () => {
    expect(preferredVariant(memory, ['aarch64-armv8-ce', 'x86_64-aesni'])).toBe('aarch64-linux-gnu+armv8');
  });

  it('breaks ties by list (deriver) order', () => {
    expect(preferredVariant(memory, ['x86_64'])).toBe('x86_64-linux-gnu+c-ref');
  });

  it('falls back to an older preference, then the default, when no token is shared', () => {
    expect(preferredVariant(memory, ['riscv', 'aarch64'])).toBe('aarch64-linux-gnu+c-ref');
    expect(preferredVariant(memory, ['riscv'])).toBe('x86_64-linux-gnu+c-ref');
  });
});
