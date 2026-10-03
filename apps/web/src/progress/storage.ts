import { safeStorage } from '@cryventure/viz/storage';
import { migrate } from './migrations.ts';
import type { Progress } from './schema.ts';

/**
 * The localStorage slot. Its `v1` names the slot, not the schema: the record inside carries its own
 * `version` and is migrated on read (`migrate`), so the key stays when the schema version changes
 * (schema v2 still lives here). Renaming it would orphan every learner's stored progress.
 */
export const PROGRESS_STORAGE_KEY = 'cv.progress.v1';

/** Parses a stored string; `null`, unparsable JSON or garbage yield empty progress. */
export function parseStoredProgress(raw: string | null | undefined): Progress {
  if (raw === null || raw === undefined) return migrate(undefined);
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return migrate(undefined);
  }
}

/** Never throws; empty progress when storage is unavailable or the entry is unreadable. */
export function loadProgress(): Progress {
  try {
    return parseStoredProgress(safeStorage()?.getItem(PROGRESS_STORAGE_KEY));
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

