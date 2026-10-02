import { useCallback, useEffect, useState } from 'react';
import { readLabLink, type LabLinkRead } from '../../labs/deepLink.ts';
import { browserHashEnvironment, createLabHashWriter } from '../../labs/hashWriter.ts';
import type { LabMode } from '@cryventure/viz';
import { rerunLab, startLab, type LabParams, type LabSession } from '../../labs/labSession.ts';
import { parseStartAt } from '../../labs/startAt.ts';

export interface UseLabSessionOptions {
  labId: string;
  producerId: string;
  presetId?: string;
  /** `startAt` attribute text (validated at build time by `Lab.astro`). */
  startAt?: string;
  mode?: LabMode;
}

export interface LabSessionApi {
  session: LabSession;
  /** Re-runs the producer with validated params. */
  applyParams: (params: LabParams) => void;
  /** Forgets the deep link and starts over from the preset. */
  reset: () => void;
}

const ABSENT: LabLinkRead = { status: 'absent' };

/** Client-only lifecycle: read the hash, load + run the producer, then re-run on param edits. */
export function useLabSession({ labId, producerId, presetId, startAt, mode }: UseLabSessionOptions): LabSessionApi {
  const [session, setSession] = useState<LabSession>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const link = generation === 0 ? readLabLink(window.location.hash, labId) : ABSENT;
    void startLab({ producerId, presetId, link, startAt: startAt === undefined ? undefined : parseStartAt(startAt), mode }).then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, [labId, producerId, presetId, startAt, mode, generation]);

  const applyParams = useCallback(
    (params: LabParams) => {
      if (session.status !== 'ready') return;
      void rerunLab(session, params).then((next) => {
        if ('status' in next) setSession(next);
      });
    },
    [session],
  );

  const reset = useCallback(() => {
    createLabHashWriter(labId, browserHashEnvironment()).clear();
    setSession({ status: 'loading' });
    setGeneration((current) => current + 1);
  }, [labId]);

  return { session, applyParams, reset };
}
