import { createContext, useContext, type ReactNode } from 'react';

/** Layout facts of one lab that the chrome and the views share (measured once, on the lab container). */
export interface LabLayout {
  /** The lab is narrower than the workspace breakpoint: panels stack, caption views become the caption. */
  narrow: boolean;
}

/** Whether the surrounding lab is narrow; wide outside a lab (SSR and the first render are wide, too). */
const NarrowContext = createContext(false);

export interface LabLayoutProviderProps {
  narrow: boolean;
  children: ReactNode;
}

export function LabLayoutProvider({ narrow, children }: LabLayoutProviderProps) {
  return <NarrowContext.Provider value={narrow}>{children}</NarrowContext.Provider>;
}

/** The surrounding lab's layout; wide outside a lab. */
export function useLabLayout(): LabLayout {
  return { narrow: useContext(NarrowContext) };
}
