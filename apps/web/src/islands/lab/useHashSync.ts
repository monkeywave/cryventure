import { useEffect, useRef } from 'react';
import type { LabStore } from '@cryventure/viz';
import { browserHashEnvironment, createLabHashWriter, type HashEnvironment } from '../../labs/hashWriter.ts';
import type { LabParams } from '../../labs/labSession.ts';

export interface HashSyncOptions {
  /** The session fell back from an unusable link (`notice`): remove this lab's group so a reload starts clean. */
  clearLink?: boolean;
  env?: () => HashEnvironment;
}

/**
 * Mirrors the lab's step and params into the URL hash (debounced `replaceState`).
 * Only user-driven changes are written; the initial state leaves the URL untouched, except that an
 * unusable link (`clearLink`) is removed at once, keeping other labs and a heading anchor.
 */
export function useHashSync(labId: string, store: LabStore, params: LabParams, { clearLink = false, env = browserHashEnvironment }: HashSyncOptions = {}): void {
  const paramsRef = useRef(params);
  const writerRef = useRef<ReturnType<typeof createLabHashWriter> | null>(null);

  useEffect(() => {
    const writer = createLabHashWriter(labId, env());
    writerRef.current = writer;
    if (clearLink) writer.clear();
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.step !== previous.step) writer.schedule({ params: paramsRef.current, step: state.step });
    });
    return () => {
      unsubscribe();
      writer.dispose();
      writerRef.current = null;
    };
  }, [labId, store, env, clearLink]);

  useEffect(() => {
    if (paramsRef.current === params) return;
    paramsRef.current = params;
    writerRef.current?.schedule({ params, step: store.getState().step });
  }, [params, store]);
}
