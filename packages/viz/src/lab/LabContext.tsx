import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { LabActions, LabState, LabStore } from './createLabStore.ts';

const LabContext = createContext<LabStore | null>(null);

export interface LabProviderProps {
  store: LabStore;
  children: ReactNode;
}

export function LabProvider({ store, children }: LabProviderProps) {
  return <LabContext.Provider value={store}>{children}</LabContext.Provider>;
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
