import { useEffect } from 'react';
import { useLab, useLabStore } from './LabContext.tsx';

/** Milliseconds per step at speed 1×. */
export const PLAYBACK_BASE_INTERVAL_MS = 800;

export function playbackIntervalMs(speed: number, baseMs: number = PLAYBACK_BASE_INTERVAL_MS): number {
  return baseMs / speed;
}

/** Auto-advances the playhead while `playing`; the store's `tick` stops at the last step. */
export function usePlayback(baseMs: number = PLAYBACK_BASE_INTERVAL_MS): void {
  const store = useLabStore();
  const playing = useLab((state) => state.playing);
  const speed = useLab((state) => state.speed);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => store.getState().tick(), playbackIntervalMs(speed, baseMs));
    return () => clearInterval(id);
  }, [store, playing, speed, baseMs]);
}
