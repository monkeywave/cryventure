import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readLabLink, type LabLinkRead } from '../../labs/deepLink.ts';
import { browserHashEnvironment, createLabHashWriter } from '../../labs/hashWriter.ts';
import type { I18nRef } from '@cryventure/core';
import type { LabHrefBuilder, LabMode, ParamsPatch } from '@cryventure/viz';
import { createLabHref } from '../../labs/labHref.ts';
import { createLabRunner, type LabRunner } from '../../labs/labRunner.ts';
import { requestLabParams, rerunLab, startLab, type IsCurrentRun, type LabParams, type LabSession } from '../../labs/labSession.ts';
import { parseStartAt } from '../../labs/startAt.ts';

export interface UseLabSessionOptions {
  labId: string;
  producerId: string;
  presetId?: string;
  /** `startAt` attribute text (validated at build time by `Lab.astro`). */
  startAt?: string;
  mode?: LabMode;
  /** Page locale, for links to standalone labs (`useLabActions().labHref`). */
  locale?: string;
}

export interface LabSessionApi {
  session: LabSession;
  /** Re-runs the producer with validated params. */
  applyParams: (params: LabParams) => void;
  /** A view's re-run request (`useLabActions().requestParams`): merged, validated, then applied like `applyParams`. */
  requestParams: (patch: ParamsPatch) => void;
  /** Why the last view request was rejected; `null` once params are applied again. */
  requestError: I18nRef | null;
  /** Forgets the deep link and starts over from the preset. */
  reset: () => void;
}

const ABSENT: LabLinkRead = { status: 'absent' };

/**
 * Returns `beginRun`: each call starts a new run and returns `isCurrent`, which stays true only until
 * the next run starts. Re-runs, view requests and resets share it, so a slow result never overwrites a newer one.
 */
function useRunGuard(): () => IsCurrentRun {
  const latestRun = useRef(0);
  return useCallback(() => {
    const run = ++latestRun.current;
    return () => run === latestRun.current;
  }, []);
}

/** One runner per lab instance (a newer run terminates an older worker run); a running worker stops on unmount. */
function useLabRunner(): LabRunner {
  const [runner] = useState(() => createLabRunner());
  useEffect(() => () => runner.dispose(), [runner]);
  return runner;
}

interface LabWiring {
  runner: LabRunner;
  labHref: LabHrefBuilder;
}

/** Loads and runs the producer on mount and after every reset (a new `generation`); only the first start reads the deep link. */
function useLabStart({ labId, producerId, presetId, startAt, mode }: UseLabSessionOptions, { runner, labHref }: LabWiring, generation: number, setSession: (session: LabSession) => void): void {
  useEffect(() => {
    let cancelled = false;
    const link = generation === 0 ? readLabLink(window.location.hash, labId) : ABSENT;
    void startLab({ producerId, presetId, link, startAt: startAt === undefined ? undefined : parseStartAt(startAt), mode, runner, labHref }).then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, [labId, producerId, presetId, startAt, mode, runner, labHref, generation, setSession]);
}

/** Client-only lifecycle: read the hash, load + run the producer, then re-run on param edits. */
export function useLabSession({ labId, producerId, presetId, startAt, mode, locale }: UseLabSessionOptions): LabSessionApi {
  const [session, setSession] = useState<LabSession>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);
  const [requestError, setRequestError] = useState<I18nRef | null>(null);
  const beginRun = useRunGuard();
  const runner = useLabRunner();
  const labHref = useMemo(() => createLabHref({ base: import.meta.env.BASE_URL ?? '/', lang: locale }), [locale]);

  useLabStart({ labId, producerId, presetId, startAt, mode }, { runner, labHref }, generation, setSession);

  const applyParams = useCallback(
    (params: LabParams) => {
      if (session.status !== 'ready') return;
      const isCurrent = beginRun();
      setRequestError(null);
      void rerunLab(session, params, isCurrent).then((next) => {
        if (isCurrent()) setSession(next);
      });
    },
    [session, beginRun],
  );

  const requestParams = useCallback(
    (patch: ParamsPatch) => {
      if (session.status !== 'ready') return;
      const isCurrent = beginRun();
      void requestLabParams(session, patch, isCurrent).then((outcome) => {
        if (!isCurrent()) return;
        setRequestError(outcome.ok ? null : outcome.error);
        if (outcome.ok) setSession(outcome.session);
      });
    },
    [session, beginRun],
  );

  const reset = useCallback(() => {
    createLabHashWriter(labId, browserHashEnvironment()).clear();
    beginRun();
    setSession({ status: 'loading' });
    setRequestError(null);
    setGeneration((current) => current + 1);
  }, [labId, beginRun]);

  return { session, applyParams, requestParams, requestError, reset };
}
