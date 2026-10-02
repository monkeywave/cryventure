import type { PrimitiveManifest } from '@cryventure/core';
import type { LabLinkRead } from './deepLink.ts';

export interface StartParams<P> {
  params: P;
  /** The deep link's step; `undefined` when the link has none (the lab then uses `startAt` or the initial state). */
  step: number | undefined;
  /** True when the URL carried lab state that could not be used (the lab shows a notice). */
  notice: boolean;
}

/** Params of `presetId`, else the producer's defaults (unknown preset ids fall back silently). */
export function presetParams<P>(producer: PrimitiveManifest<P>, presetId: string | undefined): P {
  return producer.presets.find((preset) => preset.id === presetId)?.params ?? producer.defaults;
}

/** Id of the preset whose params equal `params` (after validation), if any. */
export function matchingPresetId<P>(producer: PrimitiveManifest<P>, params: P): string | undefined {
  const wanted = JSON.stringify(params);
  return producer.presets.find((preset) => JSON.stringify(preset.params) === wanted)?.id;
}

/**
 * Deep-link params (validated) win over the preset, which wins over the defaults.
 * Anything unusable in the link falls back to the preset/defaults and raises `notice`.
 */
export function resolveStartParams<P>(producer: PrimitiveManifest<P>, link: LabLinkRead, presetId?: string): StartParams<P> {
  const fallback = { params: presetParams(producer, presetId), step: undefined, notice: false };
  if (link.status === 'absent') return fallback;
  if (link.status === 'invalid') return { ...fallback, notice: true };
  const step = link.state.step;
  if (link.state.params === undefined) return { ...fallback, step };
  const validated = producer.validate(link.state.params);
  return validated.ok ? { params: validated.value, step, notice: false } : { ...fallback, notice: true };
}
