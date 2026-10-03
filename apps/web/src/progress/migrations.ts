import { emptyProgress, parseProgress, PROGRESS_VERSION, type Progress } from './schema.ts';

/** Upgrades a record of version N to version N + 1. Add one entry per future schema change. */
type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v1 keyed quiz answers by question number; v2 keys them by question id (docs/M3.md §0b). Numbers
 * cannot be mapped to ids without the lesson sources, so each lesson's answers move to `legacyQuiz`,
 * which readers fall back to. Malformed lessons are left for the parser to drop.
 */
export function migrateV1ToV2(v1: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(v1.lessons)) return { ...v1, version: 2 };
  const lessons = Object.fromEntries(Object.entries(v1.lessons).map(([key, lesson]) => [key, isRecord(lesson) ? { quiz: {}, legacyQuiz: lesson.quiz } : lesson]));
  return { ...v1, version: 2, lessons };
}

/** Version → migration to the next version. Add one entry per schema change and bump `PROGRESS_VERSION`. */
const MIGRATIONS: Readonly<Record<number, Migration>> = { 1: migrateV1ToV2 };

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
export function migrate(raw: unknown): Progress {
  let version = versionOf(raw);
  if (version === undefined || version > PROGRESS_VERSION) return emptyProgress();
  let record = raw as Record<string, unknown>;
  while (version < PROGRESS_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) return emptyProgress();
    record = step(record);
    version += 1;
  }
  return parseProgress(record) ?? emptyProgress();
}
