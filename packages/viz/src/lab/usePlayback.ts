import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { DEFAULT_STEP_DURATION } from '@cryventure/core';
import { useChoreographyResolver } from '../choreography/ChoreographyContext.tsx';
import type { ChoreographyResolver } from '../choreography/resolveChoreography.ts';
import type { LabState } from './createLabStore.ts';
import { browserScheduler, type FrameScheduler } from './frameScheduler.ts';
import { useLabStore } from './LabContext.tsx';
import { createPlaybackDriver } from './playbackDriver.ts';
import { stateFacetOf } from './stateSteps.ts';

/** Milliseconds per step at speed 1× in debugger mode. */
export const PLAYBACK_BASE_INTERVAL_MS = 800;

export function playbackIntervalMs(speed: number, baseMs: number = PLAYBACK_BASE_INTERVAL_MS): number {
  return baseMs / speed;
}

/** Story mode uses the choreography's own (storytelling) duration; debugger mode a brisk fixed one. */
export function stepDurationMs(state: LabState, resolver: ChoreographyResolver, baseMs: number = PLAYBACK_BASE_INTERVAL_MS): number {
  if (state.mode === 'debugger') return playbackIntervalMs(state.speed, baseMs);
  const seconds = resolver.at(stateFacetOf(state.bundle), state.step)?.duration ?? DEFAULT_STEP_DURATION;
  return playbackIntervalMs(state.speed, seconds * 1000);
}

export interface UsePlaybackOptions {
  scheduler?: FrameScheduler;
  baseMs?: number;
}

/** Animates the store's progress playhead and auto-advances while playing (see `createPlaybackDriver`). */
export function usePlayback({ scheduler = browserScheduler, baseMs = PLAYBACK_BASE_INTERVAL_MS }: UsePlaybackOptions = {}): void {
  const store = useLabStore();
  const resolver = useChoreographyResolver();
  const prefersReducedMotion = useReducedMotion() ?? false;
  const reducedMotion = useRef(prefersReducedMotion);
  useEffect(() => {
    reducedMotion.current = prefersReducedMotion;
  }, [prefersReducedMotion]);

  useEffect(
    () =>
      createPlaybackDriver({
        store,
        scheduler,
        stepDurationMs: (state) => stepDurationMs(state, resolver, baseMs),
        reducedMotion: () => reducedMotion.current,
      }),
    [store, scheduler, resolver, baseMs],
  );
}
