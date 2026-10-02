import { i18nRef, type I18nRef, type PrimitiveManifest, type RunResult } from '@cryventure/core';
import { createLabStore, stateSteps, type LabMode, type LabStore, type ReactViewManifest } from '@cryventure/viz';
import type { LabLinkRead } from './deepLink.ts';
import { resolveLab, type LabRegistries } from './registry.ts';
import { initialStep, type StartAt } from './startAt.ts';
import { resolveStartParams } from './startParams.ts';

export type LabParams = Record<string, unknown>;

export interface ReadySession {
  status: 'ready';
  producer: PrimitiveManifest<LabParams>;
  views: ReactViewManifest[];
  store: LabStore;
  params: LabParams;
  notice: boolean;
}

export type LabSession = { status: 'loading' } | { status: 'error'; error: I18nRef } | ReadySession;

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

/** manifest → start params (link / preset / defaults) → run → store in `mode`, seeked to the start step. */
export async function startLab({ producerId, presetId, link, startAt, mode, registries }: StartLabOptions): Promise<Exclude<LabSession, { status: 'loading' }>> {
  const resolved = resolveLab(producerId, registries);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  const producer = resolved.lab.producer as PrimitiveManifest<LabParams>;
  const start = resolveStartParams(producer, link, presetId);
  const result = await runProducer(producer, start.params);
  if (!result.ok) return { status: 'error', error: result.error };
  const store = createLabStore(result.trace);
  if (mode !== undefined) store.getState().setMode(mode);
  store.getState().seek(initialStep(start.step, startAt, stateSteps(result.trace)));
  return { status: 'ready', producer, views: resolved.lab.views, store, params: start.params, notice: start.notice };
}

/** Re-runs with new params, keeping the playhead where it was (clamped to the new timeline). */
export async function rerunLab(session: ReadySession, params: LabParams): Promise<ReadySession | I18nRef> {
  const result = await runProducer(session.producer, params);
  if (!result.ok) return result.error;
  const { store } = session;
  const step = store.getState().step;
  store.getState().setBundle(result.trace);
  store.getState().seek(step);
  return { ...session, params };
}
