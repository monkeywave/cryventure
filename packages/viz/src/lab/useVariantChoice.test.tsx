import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { createLabStore, type LabStore } from './createLabStore.ts';
import { LabProvider } from './LabContext.tsx';
import { settledVariant, useFacet } from './useFacet.ts';
import { useVariantChoice } from './useVariantChoice.ts';

const wrapperFor = (store: LabStore) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <LabProvider store={store}>{children}</LabProvider>;
  };

/** Real-world ids: one id per implementation, shared across kinds; memory also has the ISA-less `c-ref`s. */
function isaStore(options: Parameters<typeof createLabStore>[1] = {}) {
  const store = createLabStore(createFixtureBundle(), options);
  store.getState().setDerivedFacets(store.getState().bundle!, {
    'instructions@aarch64-armv8-ce': 'arm listing',
    'instructions@x86_64-aesni': 'x86 listing',
    'registers@aarch64-armv8-ce': 'arm registers',
    'registers@x86_64-aesni': 'x86 registers',
    'memory@aarch64-armv8-ce': 'arm memory',
    'memory@aarch64-c-ref': 'arm c-ref memory',
    'memory@x86_64-aesni': 'x86 memory',
    'memory@x86_64-c-ref': 'x86 c-ref memory',
  });
  return store;
}

function useThreeViews() {
  return {
    instructions: useVariantChoice<string>('instructions'),
    registers: useVariantChoice<string>('registers'),
    memory: useVariantChoice<string>('memory'),
  };
}

describe('useVariantChoice', () => {
  it('lists the variants and shows the first one, with its facet, without a preference', () => {
    const { result } = renderHook(useThreeViews, { wrapper: wrapperFor(isaStore()) });
    expect(result.current.instructions.variants).toEqual(['aarch64-armv8-ce', 'x86_64-aesni']);
    expect(result.current.instructions.current).toBe('aarch64-armv8-ce');
    expect(result.current.instructions.facet).toEqual({ status: 'ready', data: 'arm listing' });
    expect(result.current.registers.current).toBe('aarch64-armv8-ce');
  });

  it('choosing in one view switches every view sharing the variant id, memory included', () => {
    const { result } = renderHook(useThreeViews, { wrapper: wrapperFor(isaStore()) });
    act(() => result.current.instructions.choose('x86_64-aesni'));
    expect(result.current.instructions.current).toBe('x86_64-aesni');
    expect(result.current.registers.facet).toEqual({ status: 'ready', data: 'x86 registers' });
    expect(result.current.memory.facet).toEqual({ status: 'ready', data: 'x86 memory' });
  });

  it('a memory-only c-ref choice keeps the ISA views on their earlier preference', () => {
    const { result } = renderHook(useThreeViews, { wrapper: wrapperFor(isaStore()) });
    act(() => result.current.instructions.choose('x86_64-aesni'));
    act(() => result.current.memory.choose('x86_64-c-ref'));
    expect(result.current.registers.current).toBe('x86_64-aesni');
    expect(result.current.memory.current).toBe('x86_64-c-ref');
  });

  it('makes useFacet without a variant follow the preference', () => {
    const store = isaStore();
    const { result } = renderHook(() => ({ choice: useVariantChoice('instructions'), registers: useFacet('registers') }), { wrapper: wrapperFor(store) });
    expect(result.current.registers).toEqual({ status: 'ready', data: 'arm registers' });
    act(() => result.current.choice.choose('x86_64-aesni'));
    expect(result.current.registers).toEqual({ status: 'ready', data: 'x86 registers' });
  });

  it("starts from the host's preferred variant and keeps it across a re-run", async () => {
    const store = isaStore({ preferredVariant: 'x86_64-aesni' });
    const { result } = renderHook(useThreeViews, { wrapper: wrapperFor(store) });
    expect(result.current.memory.current).toBe('x86_64-aesni');
    act(() => store.getState().setBundle(createFixtureBundle()));
    expect(store.getState().preferredVariants).toEqual(['x86_64-aesni']);
    await waitFor(() => expect(result.current.instructions.current).toBeUndefined());
  });
});

describe('settledVariant', () => {
  const memory = ['aarch64-armv8-ce', 'aarch64-c-ref', 'x86_64-aesni', 'x86_64-c-ref'];

  it('picks the most recent preferred id the kind has exactly', () => {
    expect(settledVariant(memory, ['riscv', 'x86_64-c-ref', 'x86_64-aesni'], false)).toBe('x86_64-c-ref');
  });

  it('otherwise falls back to default, else the first in deriver order, once settled', () => {
    expect(settledVariant(memory, ['riscv'], false)).toBe('aarch64-armv8-ce');
    expect(settledVariant(['x', 'default'], ['riscv'], false)).toBe('default');
  });

  it('while a deriver is pending, only an exact match (or default without preferences) is final', () => {
    expect(settledVariant(memory, ['x86_64-aesni'], true)).toBe('x86_64-aesni');
    expect(settledVariant(memory, [], true)).toBeUndefined();
    expect(settledVariant(['default'], [], true)).toBe('default');
    expect(settledVariant(['default'], ['x86_64-aesni'], true)).toBeUndefined();
  });
});
