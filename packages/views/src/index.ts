import type { ReactViewManifest } from '@cryventure/viz';

/**
 * Each view folder contributes one `manifest.ts` (default export); no hand-maintained list.
 * Message catalogs live in `@cryventure/views/messages` so they never ship with the manifests.
 */
const manifestModules = import.meta.glob<ReactViewManifest>('./*/manifest.ts', { eager: true, import: 'default' });

/** All registered view manifests (unordered; core `viewsFor` orders the views a lab offers). */
export const viewManifests: readonly ReactViewManifest[] = Object.values(manifestModules);
