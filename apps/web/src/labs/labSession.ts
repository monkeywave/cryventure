import { getFacet, type ChoreographyModule, type I18nRef, type PrimitiveManifest, type TraceBundle } from '@cryventure/core';
import { createLabStore, stateSteps, type AnyStateFacet, type LabHrefBuilder, type LabMode, type LabStore, type ReactViewManifest } from '@cryventure/viz';
import type { LabLinkRead } from './deepLink.ts';
import { createLabRunner, type LabRunner } from './labRunner.ts';
import { mergeParams } from './paramFields.ts';
import { producerRegistry, resolveLab, type LabRegistries } from './registry.ts';
import { initialStep, type StartAt } from './startAt.ts';
import { resolveStartParams } from './startParams.ts';
import { mapStepAcrossTraces } from './stepMapping.ts';

export { runProducer } from './runProducer.ts';

export type LabParams = Record<string, unknown>;

export interface ReadySession {
  status: 'ready';
  producer: PrimitiveManifest<LabParams>;
  views: ReactViewManifest[];
  store: LabStore;
  params: LabParams;
  notice: boolean;
  /** The producer's choreography, loaded up front; `undefined` = the generic fallback. */
  choreography: ChoreographyModule | undefined;
  /** Runs the producer (main thread or worker); re-runs go through it so a newer run supersedes an older one. */
  runner: LabRunner;
}

export type LabSession = { status: 'loading' } | { status: 'error'; error: I18nRef } | ReadySession;

/** What `startLab` resolves to: never `loading`. */
export type SettledLabSession = Exclude<LabSession, { status: 'loading' }>;

export interface StartLabOptions {
  producerId: string;
  presetId?: string;
  link: LabLinkRead;
  /** Lesson-authored start position, used when the link carries no step. */
  startAt?: StartAt;
  /** Preselected player mode (never starts playback by itself). */
  mode?: LabMode;
  registries?: LabRegistries;
  /** The lab's runner, shared across resets (default: a fresh one over `registries.producers`). */
  runner?: LabRunner;
  /** Links to standalone labs for views (`useLabActions().labHref`). */
  labHref?: LabHrefBuilder;
}

/** Loads the producer's optional choreography (code-split); a failed import keeps the generic fallback. */
export async function loadChoreographyModule(producer: Pick<PrimitiveManifest, 'loadChoreography'>): Promise<ChoreographyModule | undefined> {
  try {
    return await producer.loadChoreography?.();
  } catch {
    return undefined;
  }
}

/** Warms the views' code-split chunks; a failed chunk is left to the view's own error boundary. */
export async function preloadViews(views: readonly Pick<ReactViewManifest, 'load'>[]): Promise<void> {
  await Promise.allSettled(views.map((view) => view.load()));
}

/**
 * manifest → start params (link / preset / defaults) → run (ports prepared, main thread or worker) → store in `mode`, seeked to the start step.
 * The producer module, its choreography and the views load in parallel, not one after another.
 */
export async function startLab({ producerId, presetId, link, startAt, mode, registries, runner: givenRunner, labHref }: StartLabOptions): Promise<SettledLabSession> {
  const resolved = resolveLab(producerId, registries);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  const producer = resolved.lab.producer as PrimitiveManifest<LabParams>;
  const { views } = resolved.lab;
  const start = resolveStartParams(producer, link, presetId);
  const runner = givenRunner ?? createLabRunner(undefined, registries?.producers ?? producerRegistry);
  const [result, choreography] = await Promise.all([runner.run(producer, start.params), loadChoreographyModule(producer), preloadViews(views)]);
  if (!result.ok) return { status: 'error', error: result.error };
  const store = createLabStore(result.trace, { labHref });
  if (mode !== undefined) store.getState().setMode(mode);
  store.getState().seek(initialStep(start.step, startAt, stateSteps(result.trace)));
  return { status: 'ready', producer, views, store, params: start.params, notice: start.notice, choreography, runner };
}

/** `true` while a run is still the latest one; a superseded run must not touch the shared store. */
export type IsCurrentRun = () => boolean;

const ALWAYS_CURRENT: IsCurrentRun = () => true;

/**
 * What a re-run or a view request resolves to. A failure (invalid params, or a run error such as a
 * key of the wrong length) never replaces the ready session: the caller keeps the last good bundle
 * and shows the error next to the inputs. Only a failed `startLab` yields an error session.
 */
export type RunOutcome = { ok: true; session: ReadySession } | { ok: false; error: I18nRef };

/**
 * Re-runs with new params, keeping the learner's place: the playhead is mapped to the same meaning in
 * the new trace (`mapStepAcrossTraces`), and breakpoints and the watched cell survive where they still
 * apply. A failed run leaves the store untouched, as does a run that `isCurrent` reports superseded by
 * the time it settles (its result is for the caller to drop).
 */
export async function rerunLab(session: ReadySession, params: LabParams, isCurrent: IsCurrentRun = ALWAYS_CURRENT): Promise<RunOutcome> {
  const result = await session.runner.run(session.producer, params);
  if (!result.ok) return result;
  if (!isCurrent()) return { ok: true, session: { ...session, params } };
  const { bundle, step, setBundle, seek } = session.store.getState();
  const nextStep = mapStepAcrossTraces(stateFacet(bundle), step, stateFacet(result.trace));
  setBundle(result.trace, { preserveDebugContext: true });
  seek(nextStep);
  return { ok: true, session: { ...session, params } };
}

/** Merges `patch` into the session's params, validates with the producer, then re-runs (`rerunLab`); invalid patches never reach the producer. */
export async function requestLabParams(session: ReadySession, patch: Readonly<Record<string, unknown>>, isCurrent: IsCurrentRun = ALWAYS_CURRENT): Promise<RunOutcome> {
  const merged = mergeParams(session.producer, session.params, patch);
  if (!merged.ok) return merged;
  return rerunLab(session, merged.value, isCurrent);
}

function stateFacet(bundle: TraceBundle | null): AnyStateFacet | undefined {
  return bundle === null ? undefined : getFacet<AnyStateFacet>(bundle, 'state');
}
