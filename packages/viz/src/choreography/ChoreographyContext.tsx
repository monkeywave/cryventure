import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { MotionValue } from 'motion/react';
import type { Beat, ChoreographyModule, StepChoreography } from '@cryventure/core';
import { useLab, useLabStore } from '../lab/LabContext.tsx';
import { stateFacetOf } from '../lab/stateSteps.ts';
import { activeBeatIndex } from './nodeTracks.ts';
import { createChoreographyResolver, type ChoreographyResolver } from './resolveChoreography.ts';

const fallbackResolver = createChoreographyResolver();
const ResolverContext = createContext<ChoreographyResolver>(fallbackResolver);

export interface ChoreographyProviderProps {
  /** The producer's choreography module; without one every step uses the generic fallback. */
  module?: ChoreographyModule;
  children: ReactNode;
}

export function ChoreographyProvider({ module, children }: ChoreographyProviderProps) {
  const resolver = useMemo(() => createChoreographyResolver(module), [module]);
  return <ResolverContext.Provider value={resolver}>{children}</ResolverContext.Provider>;
}

export function useChoreographyResolver(): ChoreographyResolver {
  return useContext(ResolverContext);
}

/** The continuous in-step playhead (0..1). Subscribe with `useTransform` / `.on('change')`; it never re-renders. */
export function useStepProgress(): MotionValue<number> {
  return useLabStore().getState().progress;
}

/** The current step's choreography (memoised per step); `undefined` at the initial state. */
export function useChoreography(): StepChoreography | undefined {
  const resolver = useChoreographyResolver();
  const bundle = useLab((state) => state.bundle);
  const step = useLab((state) => state.step);
  return useMemo(() => resolver.at(stateFacetOf(bundle), step), [resolver, bundle, step]);
}

function useBeatAt(choreography: StepChoreography | undefined, inFlightOnly: boolean): Beat | undefined {
  const progress = useStepProgress();
  const snapshot = () => (inFlightOnly && progress.get() >= 1 ? -1 : activeBeatIndex(choreography, progress.get()));
  const subscribe = useCallback((onChange: () => void) => progress.on('change', onChange), [progress]);
  const index = useSyncExternalStore(subscribe, snapshot, snapshot);
  return choreography?.beats[index];
}

/** The active beat at the playhead; re-renders only when the beat changes, not per frame. */
export function useActiveBeat(choreography: StepChoreography | undefined): Beat | undefined {
  return useBeatAt(choreography, false);
}

/**
 * The active beat while the step is in flight (progress < 1), for camera focus: a finished step
 * (and every exact jump) shows the whole state undimmed.
 */
export function useFocusBeat(choreography: StepChoreography | undefined): Beat | undefined {
  return useBeatAt(choreography, true);
}
