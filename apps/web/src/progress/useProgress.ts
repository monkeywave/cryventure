import { useSyncExternalStore } from 'react';
import { emptyProgress, type Progress } from './schema.ts';
import { getProgress, subscribe } from './store.ts';

const SERVER_PROGRESS: Progress = Object.freeze(emptyProgress());

/**
 * Subscribes a component to a slice of progress. The selector must return a primitive or a reference
 * already held in the progress (not a fresh object), or React re-renders forever. During SSR and
 * hydration it sees empty progress.
 */
export function useProgress<T>(selector: (progress: Progress) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getProgress()),
    () => selector(SERVER_PROGRESS),
  );
}
