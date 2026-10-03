import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { DeriverManifest } from '@cryventure/core';
import type { LabActions, LabState, LabStore } from './createLabStore.ts';

const LabContext = createContext<LabStore | null>(null);

const NO_DERIVERS: readonly DeriverManifest[] = [];
const DeriversContext = createContext<readonly DeriverManifest[]>(NO_DERIVERS);

export interface LabProviderProps {
  store: LabStore;
  /** The derivers `useFacet` may run lazily for this lab (default: none). */
  derivers?: readonly DeriverManifest[];
  children: ReactNode;
}

export function LabProvider({ store, derivers = NO_DERIVERS, children }: LabProviderProps) {
  return (
    <LabContext.Provider value={store}>
      <DeriversContext.Provider value={derivers}>{children}</DeriversContext.Provider>
    </LabContext.Provider>
  );
}

/** The lab's derivers (`LabRoot`'s `derivers` prop); empty outside a provider that sets them. */
export function useDerivers(): readonly DeriverManifest[] {
  return useContext(DeriversContext);
}

/** The lab's store itself, for imperative access (`getState()`) in effects and handlers. */
export function useLabStore(): LabStore {
  const store = useContext(LabContext);
  if (store === null) throw new Error('useLab/useLabStore must be used inside <LabProvider>');
  return store;
}

/** Subscribes to a slice of the lab state; re-renders only when the selected value changes. */
export function useLab<T>(selector: (state: LabState) => T): T {
  return useStore(useLabStore(), selector);
}

/** The lab's actions; zustand keeps them referentially stable, so this never re-renders. */
export function useLabActions(): LabActions {
  return useLabStore().getState();
}
