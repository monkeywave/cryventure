import { layoutStorageKey, safeStorage } from '@cryventure/viz';

/**
 * Former view id → current view id. The only place renamed view ids are resolved: lesson `layout`
 * presets and the panel sizes a reader saved (`cv.layout.v1.<labId>`, keyed by view id) may still
 * name an old id. Deep links (`#lab=…`) carry params and step only, never view ids. Presets are
 * resolved on the server (`components/labIsland.ts`), saved sizes on the client (`useStoredLayoutMigration`).
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

/** `ids` with every aliased id resolved; whether any changed. */
function resolveIds<T>(ids: readonly T[]): { ids: T[]; changed: boolean } {
  const resolved = ids.map((id) => (typeof id === 'string' ? (resolveViewId(id) as T) : id));
  return { ids: resolved, changed: resolved.some((id, index) => id !== ids[index]) };
}

/** Sizes keyed by current view ids; an entry already under the current id wins over its alias's. */
function resolveSizes(sizes: Record<string, unknown>): Record<string, unknown> {
  const current = Object.entries(sizes).filter(([id]) => resolveViewId(id) === id);
  const aliased = Object.entries(sizes).filter(([id]) => resolveViewId(id) !== id && !Object.hasOwn(sizes, resolveViewId(id)));
  return Object.fromEntries([...current, ...aliased.map(([id, size]) => [resolveViewId(id), size] as const)]);
}

/** The stored layout with aliased panel ids and size keys renamed, or `undefined` when nothing changes. */
function migratedLayout(stored: unknown): unknown {
  if (!isRecord(stored) || !Array.isArray(stored.panelIds) || !isRecord(stored.sizes)) return undefined;
  const panels = resolveIds(stored.panelIds);
  const sizesChanged = Object.keys(stored.sizes).some((id) => resolveViewId(id) !== id);
  if (!panels.changed && !sizesChanged) return undefined;
  return { ...stored, panelIds: panels.ids, sizes: resolveSizes(stored.sizes) };
}

/** The part of `Storage` the migration uses. */
export type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Rewrites this lab's saved panel sizes to current view ids, so a renamed view keeps the reader's
 * sizes instead of resetting the layout. Idempotent; never throws (blocked or corrupt storage is left
 * alone); `null` = no storage (nothing to migrate).
 */
export function migrateStoredLayout(labId: string, storage: LayoutStorage | null = safeStorage() ?? null): void {
  if (storage === null) return;
  try {
    const key = layoutStorageKey(labId);
    const raw = storage.getItem(key);
    if (raw === null) return;
    const migrated = migratedLayout(JSON.parse(raw));
    if (migrated !== undefined) storage.setItem(key, JSON.stringify(migrated));
  } catch {
    // Unreadable storage: the workspace falls back to the preset layout.
  }
}
