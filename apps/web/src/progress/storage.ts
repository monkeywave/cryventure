import { safeStorage } from '@cryventure/viz/storage';
import { migrate } from './migrations.ts';
import type { Progress } from './schema.ts';

/**
 * The localStorage slot of schema v2. Each schema version that older app versions cannot read gets
 * its own slot: an old tab that is still open parses a newer record as empty and would otherwise
 * write its own empty record over it.
 */
export const PROGRESS_STORAGE_KEY = 'cv.progress.v2';

/**
 * The slot of schema v1. Read once to seed `PROGRESS_STORAGE_KEY` (see `loadProgress`) and never
 * written, so tabs of the old app version keep their own data.
 */
export const LEGACY_PROGRESS_STORAGE_KEY = 'cv.progress.v1';

/** Parses a stored string; `null`, unparsable JSON or garbage yield empty progress. */
export function parseStoredProgress(raw: string | null | undefined): Progress {
  if (raw === null || raw === undefined) return migrate(undefined);
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return migrate(undefined);
  }
}

/** The v1 record migrated and copied into the v2 slot, or empty progress when there is none. */
function migrateLegacySlot(storage: Storage): Progress {
  const legacy = storage.getItem(LEGACY_PROGRESS_STORAGE_KEY);
  const progress = parseStoredProgress(legacy);
  if (legacy !== null) saveProgress(progress);
  return progress;
}

/**
 * Never throws; empty progress when storage is unavailable or the entry is unreadable. While the v2
 * slot is absent, the v1 slot is migrated into it (and left as it is).
 */
export function loadProgress(): Progress {
  try {
    const storage = safeStorage();
    const stored = storage?.getItem(PROGRESS_STORAGE_KEY);
    if (storage !== undefined && stored === null) return migrateLegacySlot(storage);
    return parseStoredProgress(stored);
  } catch {
    return parseStoredProgress(undefined);
  }
}

/** Best effort: returns `false` when storage is unavailable or full. */
export function saveProgress(progress: Progress): boolean {
  try {
    const storage = safeStorage();
    if (storage === undefined) return false;
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

