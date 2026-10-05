import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readLabLink, type LabLinkRead } from '../../labs/deepLink.ts';
import { browserHashEnvironment, createLabHashWriter } from '../../labs/hashWriter.ts';
import type { I18nRef } from '@cryventure/core';
import type { BlockLabHrefBuilder, LabHrefBuilder, LabMode, ParamsPatch } from '@cryventure/viz';
import { createBlockLabHref, createLabHref } from '../../labs/labHref.ts';
import { createLabRunner, type LabRunner } from '../../labs/labRunner.ts';
import { rerunLab, startLab, type IsCurrentRun, type LabParams, type LabSession, type ReadySession } from '../../labs/labSession.ts';
import { mergeParams } from '../../labs/paramFields.ts';
import { RUN_FAILED_ERROR } from '../../labs/runProducer.ts';
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

/** A run begun by `RunGuard.beginRun`. */
interface CurrentRun {
  /** True only until the next run starts (or a start supersedes it). */
  isCurrent: IsCurrentRun;
  /** Ends the run (no-op once superseded): no longer `computing`; a failed run reports `error`, a clean one keeps a later-reported error. */
  settle: (error?: I18nRef) => void;
}

interface RunGuard {
  /** Starts a re-run that supersedes every earlier one; it is in flight (`computing`) until settled. */
  beginRun: () => CurrentRun;
  /** Supersedes every run without starting one (a lab start): nothing in flight, no error. */
  supersede: () => void;
  /** Reports an error that needed no run (e.g. an invalid view request); a pending run stays in flight. */
  reportError: (error: I18nRef) => void;
  /** Whether the current re-run is in flight. */
  computing: boolean;
  /** Why the last re-run or request failed; `null` once a run starts. */
  requestError: I18nRef | null;
}

interface RunStatus {
  computing: boolean;
  error: I18nRef | null;
}

const IDLE: RunStatus = { computing: false, error: null };

/**
 * Owns the re-runs' in-flight state: each run supersedes the earlier ones, so a slow result never
 * overwrites a newer one, and only the current run's settle ends `computing`. Re-runs, view requests
 * and starts share it.
 */
function useRunGuard(): RunGuard {
  const latestRun = useRef(0);
  const [status, setStatus] = useState<RunStatus>(IDLE);
  const beginRun = useCallback((): CurrentRun => {
    const run = ++latestRun.current;
    const isCurrent = () => run === latestRun.current;
    setStatus({ computing: true, error: null });
    const settle = (error?: I18nRef) => {
      if (isCurrent()) setStatus((current) => ({ computing: false, error: error ?? current.error }));
    };
    return { isCurrent, settle };
  }, []);
  const supersede = useCallback(() => {
    latestRun.current += 1;
    setStatus(IDLE);
  }, []);
  const reportError = useCallback((error: I18nRef) => setStatus((current) => ({ ...current, error })), []);
  return { beginRun, supersede, reportError, computing: status.computing, requestError: status.error };
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
  /** The run guard's `supersede` (stable), called as each start begins: a pending re-run's late result is ignored. */
  supersede: () => void;
}

/**
 * Loads and runs the producer on mount, after every reset (a new `generation`) and when its props
 * change; only the first start reads the deep link.
 */
function useLabStart({ labId, producerId, presetId, startAt, mode, variant }: UseLabSessionOptions, { runner, labHref, blockLabHref, supersede }: LabWiring, generation: number, setSession: (session: LabSession) => void): void {
  useEffect(() => {
    let cancelled = false;
    supersede();
    const link = generation === 0 ? readLabLink(window.location.hash, labId) : ABSENT;
    void startLab({ producerId, presetId, link, startAt: startAt === undefined ? undefined : parseStartAt(startAt), mode, variant, runner, labHref, blockLabHref }).then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, [labId, producerId, presetId, startAt, mode, variant, runner, labHref, blockLabHref, supersede, generation, setSession]);
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
}

/**
 * Re-runs on param edits and view requests. A second edit merges into the pending params rather than
 * into `session.params` (which updates only once a run finishes), so it never drops the first. A failure
 * (invalid params or a run error) keeps the ready session with its last good bundle and is reported
 * through the run guard (`requestError`).
 */
function useParamRuns(session: LabSession, setSession: (session: LabSession) => void, runs: RunGuard, pending: PendingParams): ParamRuns {
  const { beginRun, reportError } = runs;
  const { latestPendingParams, setPendingParams } = pending;

  const run = useCallback(
    (ready: ReadySession, params: LabParams) => {
      const current = beginRun();
      setPendingParams(params);
      void rerunLab(ready, params, current.isCurrent).then(
        (outcome) => {
          if (!current.isCurrent()) return;
          current.settle(outcome.ok ? undefined : outcome.error);
          if (outcome.ok) setSession(outcome.session);
        },
        // A throw after the run (e.g. mapping the step onto the new trace) is a run error too.
        () => current.settle(RUN_FAILED_ERROR),
      );
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
      else reportError(merged.error);
    },
    [session, run, latestPendingParams, reportError],
  );

  return { applyParams, requestParams };
}

/** Client-only lifecycle: read the hash, load + run the producer, then re-run on param edits. */
export function useLabSession({ labId, producerId, presetId, startAt, mode, variant, locale }: UseLabSessionOptions): LabSessionApi {
  const [session, setSession] = useState<LabSession>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);
  const runs = useRunGuard();
  const runner = useLabRunner();
  const labHref = useMemo(() => createLabHref({ base: import.meta.env.BASE_URL ?? '/', lang: locale }), [locale]);
  const blockLabHref = useMemo(() => createBlockLabHref({ base: import.meta.env.BASE_URL ?? '/', lang: locale }), [locale]);
  const pending = usePendingParams();
  const { pendingParams, setPendingParams } = pending;
  const { applyParams, requestParams } = useParamRuns(session, setSession, runs, pending);
  const settleStart = useCallback(
    (next: LabSession) => {
      setPendingParams(next.status === 'ready' ? next.params : null);
      setSession(next);
    },
    [setPendingParams],
  );

  // Every start (after `reset`, or on changed props) supersedes any pending re-run.
  useLabStart({ labId, producerId, presetId, startAt, mode, variant }, { runner, labHref, blockLabHref, supersede: runs.supersede }, generation, settleStart);

  // Supersedes a pending re-run right away, so its result cannot land before the new start's effect.
  const { supersede } = runs;
  const reset = useCallback(() => {
    supersede();
    createLabHashWriter(labId, browserHashEnvironment()).clear();
    setPendingParams(null);
    setSession({ status: 'loading' });
    setGeneration((current) => current + 1);
  }, [labId, setPendingParams, supersede]);

  return { session, pendingParams, applyParams, requestParams, requestError: runs.requestError, computing: runs.computing, reset };
}
