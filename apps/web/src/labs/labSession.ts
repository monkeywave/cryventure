import { getFacet, i18nRef, type ChoreographyModule, type I18nRef, type PrimitiveManifest, type RunResult, type TraceBundle } from '@cryventure/core';
import { createLabStore, stateSteps, type AnyStateFacet, type LabMode, type LabStore, type ReactViewManifest } from '@cryventure/viz';
import type { LabLinkRead } from './deepLink.ts';
import { resolveLab, type LabRegistries } from './registry.ts';
import { initialStep, type StartAt } from './startAt.ts';
import { resolveStartParams } from './startParams.ts';
import { mapStepAcrossTraces } from './stepMapping.ts';

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
}

export type LabSession = { status: 'loading' } | { status: 'error'; error: I18nRef } | ReadySession;

/** What `startLab` / `rerunLab` resolve to: never `loading`. */
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
}

/** Loads the producer implementation (code-split) and runs it; a failed import becomes an i18n error. */
export async function runProducer<P>(producer: PrimitiveManifest<P>, params: P): Promise<RunResult> {
  try {
    const module = await producer.load();
    return module.run(params);
  } catch {
    return { ok: false, error: i18nRef('ui.lab.error.loadFailed') };
  }
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
 * manifest → start params (link / preset / defaults) → run → store in `mode`, seeked to the start step.
 * The producer module, its choreography and the views load in parallel, not one after another.
 */
export async function startLab({ producerId, presetId, link, startAt, mode, registries }: StartLabOptions): Promise<SettledLabSession> {
  const resolved = resolveLab(producerId, registries);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  const producer = resolved.lab.producer as PrimitiveManifest<LabParams>;
  const { views } = resolved.lab;
  const start = resolveStartParams(producer, link, presetId);
  const [result, choreography] = await Promise.all([runProducer(producer, start.params), loadChoreographyModule(producer), preloadViews(views)]);
  if (!result.ok) return { status: 'error', error: result.error };
  const store = createLabStore(result.trace);
  if (mode !== undefined) store.getState().setMode(mode);
  store.getState().seek(initialStep(start.step, startAt, stateSteps(result.trace)));
  return { status: 'ready', producer, views, store, params: start.params, notice: start.notice, choreography };
}

/**
 * Re-runs with new params, keeping the learner's place: the playhead is mapped to the same meaning in
 * the new trace (`mapStepAcrossTraces`), and breakpoints and the watched cell survive where they still
 * apply. A failed run becomes an error session and leaves the store untouched.
 */
export async function rerunLab(session: ReadySession, params: LabParams): Promise<SettledLabSession> {
  const result = await runProducer(session.producer, params);
  if (!result.ok) return { status: 'error', error: result.error };
  const { bundle, step, setBundle, seek } = session.store.getState();
  const nextStep = mapStepAcrossTraces(stateFacet(bundle), step, stateFacet(result.trace));
  setBundle(result.trace, { preserveDebugContext: true });
  seek(nextStep);
  return { ...session, params };
}

function stateFacet(bundle: TraceBundle | null): AnyStateFacet | undefined {
  return bundle === null ? undefined : getFacet<AnyStateFacet>(bundle, 'state');
}
