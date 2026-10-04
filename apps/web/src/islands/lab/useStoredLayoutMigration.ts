import { useState } from 'react';
import { migrateStoredLayout } from '../../labs/viewAliases.ts';

/**
 * Migrates this lab's saved panel sizes to current view ids (`migrateStoredLayout`) once, on the first
 * render, so the workspace rendered below already reads them under the current ids. A lazy state
 * initialiser is React's one-time-init primitive (a `useMemo` may be recomputed); the migration is
 * idempotent, so a second run (Strict Mode) is harmless.
 */
export function useStoredLayoutMigration(labId: string): void {
  useState(() => migrateStoredLayout(labId));
}
