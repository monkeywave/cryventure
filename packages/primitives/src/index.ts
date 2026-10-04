import type { PrimitiveManifest } from '@cryventure/core';

/**
 * Every primitive plugin folder contributes `./<id>/manifest.ts` with a default export.
 * The glob keeps this list free of hand-maintained entries (no merge conflicts for forks).
 */
const manifestModules = import.meta.glob<{ default: PrimitiveManifest }>('./*/manifest.ts', {
  eager: true,
});

/** Collects default-exported manifests, sorted by id for a deterministic order. */
export function collectManifests(
  modules: Record<string, { default?: unknown }>,
): PrimitiveManifest[] {
  return Object.values(modules)
    .map((module) => module.default)
    .filter(isPrimitiveManifest)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function isPrimitiveManifest(value: unknown): value is PrimitiveManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'primitive'
  );
}

export const primitiveManifests: PrimitiveManifest[] = collectManifests(manifestModules);

export { textFieldByteLength, type TextByteLength } from './textParams.ts';
