import { useCallback, useLayoutEffect, useSyncExternalStore, type RefObject } from 'react';
import type { MotionValue } from 'motion/react';
import type { NodeProps, Track } from '@cryventure/core';
import { NODE_STYLE_VARS, sampleNode, showsAfter } from '../choreography/nodeTracks.ts';

/** A cell's part of the current step's choreography, driven by the lab's progress playhead. */
export interface CellMotion {
  progress: MotionValue<number>;
  tracks: readonly Track[];
  /** Value before the step (shown until the value switch point). */
  before: number;
}

const noSubscription = () => () => {};

/** Whether the cell shows its new value; re-renders only when that flips, never per frame. */
export function useShowsAfter(motion: CellMotion | undefined): boolean {
  const progress = motion?.progress;
  const subscribe = useCallback((onChange: () => void) => progress?.on('change', onChange) ?? (() => {}), [progress]);
  const snapshot = () => motion === undefined || showsAfter(motion.tracks, motion.progress.get());
  return useSyncExternalStore(progress === undefined ? noSubscription : subscribe, snapshot, snapshot);
}

function applyNodeStyle(element: HTMLElement, props: NodeProps): void {
  for (const [prop, variable] of Object.entries(NODE_STYLE_VARS)) {
    const value = props[prop as keyof typeof NODE_STYLE_VARS];
    if (value === undefined) element.style.removeProperty(variable);
    else element.style.setProperty(variable, String(value));
  }
}

function clearNodeStyle(element: HTMLElement): void {
  applyNodeStyle(element, {});
  element.removeAttribute('data-animated');
}

/** Writes the sampled track props as CSS custom properties on every progress change (no React render). */
export function useNodeStyle(ref: RefObject<HTMLElement | null>, motion: CellMotion | undefined): void {
  const progress = motion?.progress;
  const tracks = motion?.tracks;
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || progress === undefined || tracks === undefined || tracks.length === 0) return undefined;
    const apply = (value: number) => applyNodeStyle(element, sampleNode(tracks, value));
    element.setAttribute('data-animated', '');
    apply(progress.get());
    const unsubscribe = progress.on('change', apply);
    return () => {
      unsubscribe();
      clearNodeStyle(element);
    };
  }, [ref, progress, tracks]);
}
