import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readLabLink, type LabLinkRead } from '../../labs/deepLink.ts';
import { browserHashEnvironment, createLabHashWriter } from '../../labs/hashWriter.ts';
import type { I18nRef } from '@cryventure/core';
import type { BlockLabHrefBuilder, LabHrefBuilder, LabMode, ParamsPatch } from '@cryventure/viz';
import { createBlockLabHref, createLabHref } from '../../labs/labHref.ts';
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
  /** Initial lab-wide preferred facet variant (validated at build time by `Lab.astro`). */
  variant?: string;
  /** Page locale, for links to standalone labs (`useLabActions().labHref`). */
  locale?: string;
}

export interface LabSessionApi {
  session: LabSession;
  /**
   * The params of the latest requested run, which may still be pending (or have failed): what the
   * param panel shows and builds the next edit on. `session.params` updates only once a run succeeds.
   * `null` while no session is ready.
   */
  pendingParams: LabParams | null;
  /** Re-runs the producer with validated params. */
  applyParams: (params: LabParams) => void;
  /** A view's re-run request (`useLabActions().requestParams`): merged, validated, then applied like `applyParams`. */
  requestParams: (patch: ParamsPatch) => void;
  /** Why the last re-run or view request failed (invalid params or a run error); `null` once params are applied again. The ready session keeps the last good bundle meanwhile. */
  requestError: I18nRef | null;
  /** Whether the latest re-run or view request is still running (`ComputingStatus` shows it once it takes a while). */
  computing: boolean;
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
  blockLabHref: BlockLabHrefBuilder;
}

/** Loads and runs the producer on mount and after every reset (a new `generation`); only the first start reads the deep link. */
function useLabStart({ labId, producerId, presetId, startAt, mode, variant }: UseLabSessionOptions, { runner, labHref, blockLabHref }: LabWiring, generation: number, setSession: (session: LabSession) => void): void {
  useEffect(() => {
    let cancelled = false;
    const link = generation === 0 ? readLabLink(window.location.hash, labId) : ABSENT;
    void startLab({ producerId, presetId, link, startAt: startAt === undefined ? undefined : parseStartAt(startAt), mode, variant, runner, labHref, blockLabHref }).then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, [labId, producerId, presetId, startAt, mode, variant, runner, labHref, blockLabHref, generation, setSession]);
}

interface PendingParams {
  pendingParams: LabParams | null;
  /** The same value, readable without a re-render: two requests in one tick still merge. */
  latestPendingParams: { readonly current: LabParams | null };
  setPendingParams: (params: LabParams | null) => void;
}

/** The params of the latest requested run, as state (for rendering) mirrored in a ref (for merging). */
function usePendingParams(): PendingParams {
  const [pendingParams, setState] = useState<LabParams | null>(null);
  const latestPendingParams = useRef<LabParams | null>(null);
  const setPendingParams = useCallback((params: LabParams | null) => {
    latestPendingParams.current = params;
    setState(params);
  }, []);
  return { pendingParams, latestPendingParams, setPendingParams };
}

interface ParamRuns {
  applyParams: (params: LabParams) => void;
  requestParams: (patch: ParamsPatch) => void;
  requestError: I18nRef | null;
  setRequestError: (error: I18nRef | null) => void;
  computing: boolean;
  setComputing: (computing: boolean) => void;
}

/**
 * Re-runs on param edits and view requests. A second edit merges into the pending params rather than
 * into `session.params` (which updates only once a run finishes), so it never drops the first. A failure
 * (invalid params or a run error) keeps the ready session with its last good bundle and is reported as `requestError`.
 */
function useParamRuns(session: LabSession, setSession: (session: LabSession) => void, beginRun: () => IsCurrentRun, pending: PendingParams): ParamRuns {
  const [requestError, setRequestError] = useState<I18nRef | null>(null);
  const [computing, setComputing] = useState(false);
  const { latestPendingParams, setPendingParams } = pending;

  const run = useCallback(
    (ready: ReadySession, params: LabParams) => {
      const isCurrent = beginRun();
      setPendingParams(params);
      setRequestError(null);
      setComputing(true);
      void rerunLab(ready, params, isCurrent).then((outcome) => {
        if (!isCurrent()) return;
        setComputing(false);
        if (outcome.ok) setSession(outcome.session);
        else setRequestError(outcome.error);
      });
    },
    [beginRun, setPendingParams, setSession],
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
      const merged = mergeParams(session.producer, latestPendingParams.current ?? session.params, patch);
      if (merged.ok) run(session, merged.value);
      else setRequestError(merged.error);
    },
    [session, run, latestPendingParams],
  );

  return { applyParams, requestParams, requestError, setRequestError, computing, setComputing };
}

/** Client-only lifecycle: read the hash, load + run the producer, then re-run on param edits. */
export function useLabSession({ labId, producerId, presetId, startAt, mode, variant, locale }: UseLabSessionOptions): LabSessionApi {
  const [session, setSession] = useState<LabSession>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);
  const beginRun = useRunGuard();
  const runner = useLabRunner();
  const labHref = useMemo(() => createLabHref({ base: import.meta.env.BASE_URL ?? '/', lang: locale }), [locale]);
  const blockLabHref = useMemo(() => createBlockLabHref({ base: import.meta.env.BASE_URL ?? '/', lang: locale }), [locale]);
  const pending = usePendingParams();
  const { pendingParams, setPendingParams } = pending;
  const { applyParams, requestParams, requestError, setRequestError, computing, setComputing } = useParamRuns(session, setSession, beginRun, pending);
  const settleStart = useCallback(
    (next: LabSession) => {
      setPendingParams(next.status === 'ready' ? next.params : null);
      setSession(next);
    },
    [setPendingParams],
  );

  useLabStart({ labId, producerId, presetId, startAt, mode, variant }, { runner, labHref, blockLabHref }, generation, settleStart);

  const reset = useCallback(() => {
    createLabHashWriter(labId, browserHashEnvironment()).clear();
    beginRun();
    setPendingParams(null);
    setSession({ status: 'loading' });
    setRequestError(null);
    setComputing(false);
    setGeneration((current) => current + 1);
  }, [labId, beginRun, setPendingParams, setRequestError, setComputing]);

  return { session, pendingParams, applyParams, requestParams, requestError, computing, reset };
}
