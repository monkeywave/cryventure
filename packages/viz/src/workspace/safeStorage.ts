// Side-effect free and dependency free: apps/web loads it on every page via `@cryventure/viz/storage`
// (the progress store), so it must never pull in React or the rest of the viz barrel.

/** Never throws (private mode, quota, blocked storage); returns `undefined` when unavailable. */
export function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
