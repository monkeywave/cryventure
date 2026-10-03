import type { DeriverManifest } from '@cryventure/core';

/**
 * Every deriver plugin folder contributes `./<id>/manifest.ts` with a default export. Folders
 * without a manifest (`_lib/`, data-only folders) are not matched. No hand-maintained list.
 */
const manifestExports = import.meta.glob<unknown>('./*/manifest.ts', { eager: true, import: 'default' });

/** Keeps the deriver manifests among default exports, sorted by id for a deterministic order. */
export function collectDeriverManifests(defaultExports: readonly unknown[]): DeriverManifest[] {
  return defaultExports.filter(isDeriverManifest).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function isDeriverManifest(value: unknown): value is DeriverManifest {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'deriver';
}

export const deriverManifests: readonly DeriverManifest[] = collectDeriverManifests(Object.values(manifestExports));
