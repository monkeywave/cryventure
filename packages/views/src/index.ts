import type { ReactViewManifest } from '@cryventure/viz';

/**
 * Each view folder contributes one `manifest.ts` (default export); no hand-maintained list.
 * Message catalogs live in `@cryventure/views/messages` so they never ship with the manifests.
 */
const manifestModules = import.meta.glob<ReactViewManifest>('./*/manifest.ts', { eager: true, import: 'default' });

function byOrderThenId(a: ReactViewManifest, b: ReactViewManifest): number {
  return (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);
}

/** All registered view manifests, sorted by `order` then id. */
export const viewManifests: readonly ReactViewManifest[] = Object.values(manifestModules).sort(byOrderThenId);
