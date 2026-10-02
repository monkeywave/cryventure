import { emptyProgress, parseProgressV1, PROGRESS_VERSION, type ProgressV1 } from './schema.ts';

/** Upgrades a record of version N to version N + 1. Add one entry per future schema change. */
type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

/**
 * Version → migration to the next version. Empty while version 1 is the only schema; e.g. a v2
 * would add `1: (v1) => ({ ...v1, version: 2, … })` and bump `PROGRESS_VERSION`.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {};

function versionOf(raw: unknown): number | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const { version } = raw as { version?: unknown };
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 1 ? version : undefined;
}

/** `true` when `raw` carries a version this build can read (current or older); `false` for newer or none. */
export function isSupportedVersion(raw: unknown): boolean {
  const version = versionOf(raw);
  return version !== undefined && version <= PROGRESS_VERSION;
}

/**
 * Brings any stored value up to the current schema. Garbage, unknown and future versions yield empty
 * progress. This never destroys data by itself: the store only writes back when the learner changes
 * something, so a record from a newer app version survives until then.
 */
export function migrate(raw: unknown): ProgressV1 {
  let version = versionOf(raw);
  if (version === undefined || version > PROGRESS_VERSION) return emptyProgress();
  let record = raw as Record<string, unknown>;
  while (version < PROGRESS_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) return emptyProgress();
    record = step(record);
    version += 1;
  }
  return parseProgressV1(record) ?? emptyProgress();
}
