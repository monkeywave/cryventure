import type { Lens } from '@cryventure/core';

/** Lenses from shallowest to deepest; `<Lens level>` content shows for that lens and deeper ones. */
export const LENS_ORDER: readonly Lens[] = ['story', 'engineer', 'cryptographer'];

export const DEFAULT_LENS: Lens = 'engineer';

export function isLens(value: unknown): value is Lens {
  return (LENS_ORDER as readonly unknown[]).includes(value);
}

/** `true` when `current` is `level` or a deeper lens. */
export function lensAtLeast(current: Lens, level: Lens): boolean {
  return LENS_ORDER.indexOf(current) >= LENS_ORDER.indexOf(level);
}

/** Reflects the lens on `<html data-lens>` so CSS can show and hide lens content; no-op without a DOM. */
export function applyLensToDocument(lens: Lens): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.lens = lens;
}

/** The lens a lab shows: the lens pinned by `<Lab lens>` if any, else the page lens, else the default. */
export function resolveLabLens(pinned: Lens | undefined, pageLens: Lens | undefined): Lens {
  return pinned ?? pageLens ?? DEFAULT_LENS;
}
