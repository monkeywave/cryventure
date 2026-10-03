import legacyQuizIds from './legacyQuizIds.json';
import { emptyProgress, parseProgress, PROGRESS_VERSION, type Progress } from './schema.ts';

/** Upgrades a record of version N to version N + 1. Add one entry per future schema change. */
type Migration = (record: Record<string, unknown>) => Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lesson key → v1 question number → question id, as the questions were numbered when schema v1
 * shipped (generated once from the MDX of that release).
 *
 * FROZEN: this file must never change. It describes data already stored on learners' devices, not
 * the current lessons: authors may renumber questions freely, and a new question needs no entry here.
 * `legacyQuizIds.test.ts` checks that its ids still exist in the MDX.
 */
export const LEGACY_QUIZ_IDS: Readonly<Record<string, Readonly<Record<string, string>>>> = legacyQuizIds;

/** A v1 lesson quiz with each number key replaced by its frozen id; unknown numbers are dropped. */
function quizByIds(lessonKey: string, quiz: unknown): Record<string, unknown> {
  const ids = LEGACY_QUIZ_IDS[lessonKey] ?? {};
  if (!isRecord(quiz)) return {};
  return Object.fromEntries(Object.entries(quiz).flatMap(([number, answer]) => (Object.hasOwn(ids, number) ? [[ids[number], answer]] : [])));
}

/**
 * v1 keyed quiz answers by question number; v2 keys them by question id (docs/M3.md §0b), mapped
 * through the frozen `LEGACY_QUIZ_IDS`. Malformed lessons are left for the parser to drop.
 */
export function migrateV1ToV2(v1: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(v1.lessons)) return { ...v1, version: 2 };
  const lessons = Object.fromEntries(Object.entries(v1.lessons).map(([key, lesson]) => [key, isRecord(lesson) ? { quiz: quizByIds(key, lesson.quiz) } : lesson]));
  return { ...v1, version: 2, lessons };
}

/** Version → migration to the next version. Add one entry per schema change and bump `PROGRESS_VERSION`. */
const MIGRATIONS: Readonly<Record<number, Migration>> = { 1: migrateV1ToV2 };

function versionOf(raw: unknown): number | undefined {
  if (!isRecord(raw)) return undefined;
  const { version } = raw;
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
  if (!isSupportedVersion(raw)) return emptyProgress();
  let record = raw as Record<string, unknown>;
  let version = record.version as number;
  while (version < PROGRESS_VERSION) {
    const step = MIGRATIONS[version];
    if (step === undefined) return emptyProgress();
    record = step(record);
    version += 1;
  }
  return parseProgress(record) ?? emptyProgress();
}
