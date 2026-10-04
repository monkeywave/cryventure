import { layoutStorageKey, safeStorage } from '@cryventure/viz';

/**
 * Former view id → current view id. The only place renamed view ids are resolved: lesson `layout`
 * presets and the panel sizes a reader saved (`cv.layout.v1.<labId>`, keyed by view id) may still
 * name an old id. Deep links (`#lab=…`) carry params and step only, never view ids.
 */
export const VIEW_ID_ALIASES: Readonly<Record<string, string>> = {
  'key-schedule': 'derivation',
};

/** The current id of a view (`key-schedule` → `derivation`); unknown ids pass through. */
export function resolveViewId(id: string): string {
  return Object.hasOwn(VIEW_ID_ALIASES, id) ? VIEW_ID_ALIASES[id]! : id;
}

/** A layout preset with every aliased view id replaced, sizes kept (`"key-schedule:45"` → `"derivation:45"`). */
export function resolveLayoutAliases(layout: string | undefined): string | undefined {
  if (layout === undefined) return undefined;
  const resolveEntry = (entry: string) => {
    const [id = '', ...size] = entry.split(':');
    return [resolveViewId(id.trim()), ...size].join(':');
  };
  return layout.split('|').map(resolveEntry).join('|');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The stored layout with aliased panel ids (and their size keys) renamed, or `undefined` when nothing changes. */
function migratedLayout(stored: unknown): unknown {
  if (!isRecord(stored) || !Array.isArray(stored.panelIds) || !isRecord(stored.sizes)) return undefined;
  const panelIds = stored.panelIds.map((id) => (typeof id === 'string' ? resolveViewId(id) : id));
  if (panelIds.every((id, index) => id === (stored.panelIds as unknown[])[index])) return undefined;
  const sizes = Object.fromEntries(Object.entries(stored.sizes).map(([id, size]) => [resolveViewId(id), size]));
  return { ...stored, panelIds, sizes };
}

/**
 * Rewrites this lab's saved panel sizes to current view ids, so a renamed view keeps the reader's
 * sizes instead of resetting the layout. Idempotent; never throws (blocked or corrupt storage is left alone).
 */
export function migrateStoredLayout(labId: string, storage: Storage | undefined = safeStorage()): void {
  try {
    const key = layoutStorageKey(labId);
    const raw = storage?.getItem(key);
    if (raw === null || raw === undefined) return;
    const migrated = migratedLayout(JSON.parse(raw));
    if (migrated !== undefined) storage?.setItem(key, JSON.stringify(migrated));
  } catch {
    // Unreadable storage: the workspace falls back to the preset layout.
  }
}
