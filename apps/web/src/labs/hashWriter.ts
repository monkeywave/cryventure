import { HASH_WRITE_DELAY_MS, withLabState, withoutLab, type LabLinkState } from './deepLink.ts';

/** The browser surface the writer needs; injectable for tests. */
export interface HashEnvironment {
  readHash(): string;
  /** Replaces the hash (no `#`; empty removes it) without adding a history entry. */
  replaceHash(hash: string): void;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface LabHashWriter {
  /** Debounced: only the last state within the delay is written. */
  schedule(state: LabLinkState): void;
  flush(): void;
  /** Drops pending writes and removes this lab from the hash. */
  clear(): void;
  dispose(): void;
}

/** Per-lab debounced `history.replaceState` writer; merges with other labs' entries at write time. */
export function createLabHashWriter(labId: string, env: HashEnvironment, delayMs: number = HASH_WRITE_DELAY_MS): LabHashWriter {
  let pending: LabLinkState | undefined;
  let timer: unknown;

  const cancelTimer = () => {
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
  };

  const flush = () => {
    cancelTimer();
    if (pending === undefined) return;
    const next = withLabState(env.readHash(), labId, pending);
    pending = undefined;
    if (next !== null && next !== env.readHash()) env.replaceHash(next);
  };

  return {
    schedule(state) {
      pending = state;
      cancelTimer();
      timer = env.setTimer(flush, delayMs);
    },
    flush,
    clear() {
      pending = undefined;
      cancelTimer();
      env.replaceHash(withoutLab(env.readHash(), labId));
    },
    dispose: flush,
  };
}

/** The real browser environment (`location.hash` + `history.replaceState`). */
export function browserHashEnvironment(win: Window = window): HashEnvironment {
  return {
    readHash: () => win.location.hash.replace(/^#/, ''),
    replaceHash: (hash) => {
      const { pathname, search } = win.location;
      win.history.replaceState(win.history.state, '', `${pathname}${search}${hash === '' ? '' : `#${hash}`}`);
    },
    setTimer: (callback, delayMs) => win.setTimeout(callback, delayMs),
    clearTimer: (handle) => win.clearTimeout(handle as number),
  };
}
