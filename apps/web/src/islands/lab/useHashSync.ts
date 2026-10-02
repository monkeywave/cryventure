import { useEffect, useRef } from 'react';
import type { LabStore } from '@cryventure/viz';
import { browserHashEnvironment, createLabHashWriter, type HashEnvironment } from '../../labs/hashWriter.ts';
import type { LabParams } from '../../labs/labSession.ts';

/**
 * Mirrors the lab's step and params into the URL hash (debounced `replaceState`).
 * Only user-driven changes are written; the initial state leaves the URL untouched.
 */
export function useHashSync(labId: string, store: LabStore, params: LabParams, env: () => HashEnvironment = browserHashEnvironment): void {
  const paramsRef = useRef(params);
  const writerRef = useRef<ReturnType<typeof createLabHashWriter> | null>(null);

  useEffect(() => {
    const writer = createLabHashWriter(labId, env());
    writerRef.current = writer;
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.step !== previous.step) writer.schedule({ params: paramsRef.current, step: state.step });
    });
    return () => {
      unsubscribe();
      writer.dispose();
      writerRef.current = null;
    };
  }, [labId, store, env]);

  useEffect(() => {
    if (paramsRef.current === params) return;
    paramsRef.current = params;
    writerRef.current?.schedule({ params, step: store.getState().step });
  }, [params, store]);
}
