import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readLabLink, type LabLinkRead } from '../../labs/deepLink.ts';
import { browserHashEnvironment, createLabHashWriter } from '../../labs/hashWriter.ts';
import type { I18nRef } from '@cryventure/core';
import type { LabHrefBuilder, LabMode, ParamsPatch } from '@cryventure/viz';
import { createLabHref } from '../../labs/labHref.ts';
import { createLabRunner, type LabRunner } from '../../labs/labRunner.ts';
import { rerunLab, startLab, type IsCurrentRun, type LabParams, type LabSession, type ReadySession } from '../../labs/labSession.ts';
import { mergeParams } from '../../labs/paramFields.ts';
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
  /** Why the last re-run or view request failed (invalid params or a run error); `null` once params are applied again. The ready session keeps the last good bundle meanwhile. */
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

interface ParamRuns {
  applyParams: (params: LabParams) => void;
  requestParams: (patch: ParamsPatch) => void;
  requestError: I18nRef | null;
  setRequestError: (error: I18nRef | null) => void;
}

/**
 * Re-runs on param edits and view requests. `latestParams` holds the params of the latest requested
 * run, which may still be pending: a second edit merges into these rather than into `session.params`
 * (which updates only once a run finishes), so it never drops the first. A failure (invalid params or
 * a run error) keeps the ready session with its last good bundle and is reported as `requestError`.
 */
function useParamRuns(session: LabSession, setSession: (session: LabSession) => void, beginRun: () => IsCurrentRun, latestParams: { current: LabParams | null }): ParamRuns {
  const [requestError, setRequestError] = useState<I18nRef | null>(null);

  const run = useCallback(
    (ready: ReadySession, params: LabParams) => {
      const isCurrent = beginRun();
      latestParams.current = params;
      setRequestError(null);
      void rerunLab(ready, params, isCurrent).then((outcome) => {
        if (!isCurrent()) return;
        if (outcome.ok) setSession(outcome.session);
        else setRequestError(outcome.error);
      });
    },
    [beginRun, latestParams, setSession],
  );

  const applyParams = useCallback(
    (params: LabParams) => {
      if (session.status === 'ready') run(session, params);
    },
    [session, run],
  );

  const requestParams = useCallback(
    (patch: ParamsPatch) => {
      if (session.status !== 'ready') return;
      const merged = mergeParams(session.producer, latestParams.current ?? session.params, patch);
      if (merged.ok) run(session, merged.value);
      else setRequestError(merged.error);
    },
    [session, run, latestParams],
  );

  return { applyParams, requestParams, requestError, setRequestError };
}

/** Client-only lifecycle: read the hash, load + run the producer, then re-run on param edits. */
export function useLabSession({ labId, producerId, presetId, startAt, mode, locale }: UseLabSessionOptions): LabSessionApi {
  const [session, setSession] = useState<LabSession>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);
  const beginRun = useRunGuard();
  const runner = useLabRunner();
  const labHref = useMemo(() => createLabHref({ base: import.meta.env.BASE_URL ?? '/', lang: locale }), [locale]);
  const latestParams = useRef<LabParams | null>(null);
  const { applyParams, requestParams, requestError, setRequestError } = useParamRuns(session, setSession, beginRun, latestParams);
  const settleStart = useCallback((next: LabSession) => {
    latestParams.current = next.status === 'ready' ? next.params : null;
    setSession(next);
  }, []);

  useLabStart({ labId, producerId, presetId, startAt, mode }, { runner, labHref }, generation, settleStart);

  const reset = useCallback(() => {
    createLabHashWriter(labId, browserHashEnvironment()).clear();
    beginRun();
    latestParams.current = null;
    setSession({ status: 'loading' });
    setRequestError(null);
    setGeneration((current) => current + 1);
  }, [labId, beginRun, setRequestError]);

  return { session, applyParams, requestParams, requestError, reset };
}
