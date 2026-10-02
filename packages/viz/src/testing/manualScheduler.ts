import type { FrameScheduler } from '../lab/frameScheduler.ts';

export interface ManualScheduler extends FrameScheduler {
  /** Advances the clock by `ms`, running one frame per `frameMs`. */
  advance(ms: number, frameMs?: number): void;
  /** Number of pending frame callbacks. */
  pending(): number;
}

/** A deterministic frame scheduler for tests: time only moves when `advance` is called. */
export function createManualScheduler(): ManualScheduler {
  let now = 0;
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  const runFrame = () => {
    const due = [...callbacks.entries()];
    callbacks.clear();
    due.forEach(([, callback]) => callback());
  };
  return {
    now: () => now,
    request: (callback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => void callbacks.delete(handle),
    pending: () => callbacks.size,
    advance: (ms, frameMs = 16) => {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + frameMs);
        runFrame();
      }
    },
  };
}
