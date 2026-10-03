import { safeStorage } from './safeStorage.ts';

/** Panel id → size in percent, as react-resizable-panels reports it. */
export type PanelSizes = Record<string, number>;

export const LAYOUT_VERSION = 1;
const KEY_PREFIX = `cv.layout.v${LAYOUT_VERSION}.`;

interface StoredLayout {
  version: number;
  panelIds: string[];
  sizes: PanelSizes;
}

export function layoutStorageKey(labId: string): string {
  return `${KEY_PREFIX}${labId}`;
}

function isStoredLayout(value: unknown): value is StoredLayout {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredLayout>;
  return typeof candidate.version === 'number' && Array.isArray(candidate.panelIds) && typeof candidate.sizes === 'object' && candidate.sizes !== null;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Saved sizes for exactly these panels, or `undefined`. A stale entry (other version or panel
 * set, or unparsable) is removed so the lab resets to its preset.
 */
export function loadPanelSizes(labId: string, panelIds: readonly string[]): PanelSizes | undefined {
  const storage = safeStorage();
  const key = layoutStorageKey(labId);
  try {
    const raw = storage?.getItem(key);
    if (raw === null || raw === undefined) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (isStoredLayout(parsed) && parsed.version === LAYOUT_VERSION && sameIds(parsed.panelIds, panelIds)) return parsed.sizes;
    storage?.removeItem(key);
  } catch {
    // Unreadable or corrupt storage: fall back to the preset layout.
  }
  return undefined;
}

/** Best effort: returns `false` when storage is unavailable or full. */
export function savePanelSizes(labId: string, panelIds: readonly string[], sizes: PanelSizes): boolean {
  const record: StoredLayout = { version: LAYOUT_VERSION, panelIds: [...panelIds], sizes };
  try {
    const storage = safeStorage();
    if (storage === undefined) return false;
    storage.setItem(layoutStorageKey(labId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
