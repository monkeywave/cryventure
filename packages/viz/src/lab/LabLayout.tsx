import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** Layout facts of one lab that the chrome and the views share (measured once, on the lab container). */
export interface LabLayout {
  /** The lab is narrower than the workspace breakpoint: panels stack, the narration becomes a caption. */
  narrow: boolean;
}

const WIDE_LAYOUT: LabLayout = { narrow: false };

const LabLayoutContext = createContext<LabLayout | null>(null);

export interface LabLayoutProviderProps {
  narrow: boolean;
  children: ReactNode;
}

export function LabLayoutProvider({ narrow, children }: LabLayoutProviderProps) {
  const value = useMemo<LabLayout>(() => ({ narrow }), [narrow]);
  return <LabLayoutContext.Provider value={value}>{children}</LabLayoutContext.Provider>;
}

/** The surrounding lab's layout, or `null` outside a lab (e.g. a standalone Workspace). */
export function useOptionalLabLayout(): LabLayout | null {
  return useContext(LabLayoutContext);
}

/** The surrounding lab's layout; wide outside a lab (SSR and the first render are wide, too). */
export function useLabLayout(): LabLayout {
  return useOptionalLabLayout() ?? WIDE_LAYOUT;
}
