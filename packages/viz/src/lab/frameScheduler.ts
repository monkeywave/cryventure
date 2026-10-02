/** Clock + frame source for the playback driver; injected so tests can drive time deterministically. */
export interface FrameScheduler {
  now(): number;
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const FRAME_MS = 16;

/** `requestAnimationFrame` in browsers; a timer fallback where it is missing. */
export const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => callback()) : Number(setTimeout(callback, FRAME_MS))),
  cancel: (handle) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle)),
};

/**
 * Calls `onFrame(fraction)` each frame for `durationMs` (fraction 0..1, linear), then `onDone()`.
 * Returns a cancel function. Always asynchronous; a non-positive duration finishes on the next frame.
 */
export function runTimed(scheduler: FrameScheduler, durationMs: number, onFrame: (fraction: number) => void, onDone: () => void): () => void {
  const start = scheduler.now();
  let handle = 0;
  const frame = () => {
    const fraction = durationMs > 0 ? Math.min(1, (scheduler.now() - start) / durationMs) : 1;
    onFrame(fraction);
    if (fraction < 1) handle = scheduler.request(frame);
    else onDone();
  };
  handle = scheduler.request(frame);
  return () => scheduler.cancel(handle);
}
