import type { Lens } from '@cryventure/core';
import { isLens } from './lens.ts';

export type { Lens };

export const PROGRESS_VERSION = 2;

/**
 * Whether the latest answer was correct is derived from `lastAnswer` (see `questionStatus`), so it is
 * not stored. Records written before this shape may still carry `correct` and `attempts`; the parser
 * ignores them (deriving `solved` from `correct` when `solved` is missing).
 */
export interface QuizAnswer {
  /** Answered correctly at least once; later wrong attempts keep it (the lesson score counts this). */
  solved: boolean;
  /** Index of the option the learner picked last. */
  lastAnswer: number;
}

/** How a check question is addressed: its stable id, and its display number (docs/M3.md §0b). */
export interface QuizQuestionRef {
  /** Kebab-case, unique per lesson, identical in every locale; never changes. */
  id: string;
  /** Display-only; only used to find answers recorded before ids existed (`legacyQuiz`). */
  number: number;
}

export interface LessonProgress {
  /** Question id → the learner's answer state. */
  quiz: Record<string, QuizAnswer>;
  /**
   * Answers recorded by schema v1, keyed by question number (as a string). Read only as a fallback
   * (see `resolveQuizAnswer`); answering the question again moves its entry to `quiz`.
   */
  legacyQuiz?: Record<string, QuizAnswer>;
}

export interface Progress {
  version: 2;
  lens?: Lens;
  prologue?: { completedAt: string };
  /** Lesson key (see `lessonKeyFromPath`) → progress in that lesson. */
  lessons: Record<string, LessonProgress>;
}

export function emptyProgress(): Progress {
  return { version: 2, lessons: {} };
}

const QUESTION_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const QUESTION_NUMBER = /^[1-9]\d*$/;

/**
 * Whether `value` is a valid check-question id: kebab-case (lowercase letters and digits, single
 * hyphens) starting with a letter, so it can never be mistaken for a v1 question number.
 */
export function isQuestionId(value: unknown): value is string {
  return typeof value === 'string' && QUESTION_ID.test(value);
}

/** The learner's answer to a question: by id, else the v1 answer recorded under its number. */
export function resolveQuizAnswer(lesson: LessonProgress | undefined, question: QuizQuestionRef): QuizAnswer | undefined {
  return lesson?.quiz[question.id] ?? lesson?.legacyQuiz?.[String(question.number)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseQuizAnswer(value: unknown): QuizAnswer | undefined {
  if (!isRecord(value)) return undefined;
  const { solved, correct, lastAnswer } = value;
  if (!isCount(lastAnswer)) return undefined;
  // Early v1 records lack `solved`; their `correct` (latest attempt) is the best evidence available.
  return { solved: typeof solved === 'boolean' ? solved : correct === true, lastAnswer };
}

const anyKey = (): boolean => true;

/** Keeps only well-formed entries (and keys) of a record; anything else becomes `{}`. */
function parseEntries<T>(value: unknown, parseEntry: (entry: unknown) => T | undefined, isKey: (key: string) => boolean = anyKey): Record<string, T> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).flatMap(([key, entry]) => {
    const parsed = isKey(key) ? parseEntry(entry) : undefined;
    return parsed === undefined ? [] : [[key, parsed] as const];
  });
  return Object.fromEntries(entries);
}

const isQuestionNumberKey = (key: string): boolean => QUESTION_NUMBER.test(key);

function parseLesson(value: unknown): LessonProgress | undefined {
  if (!isRecord(value)) return undefined;
  const lesson: LessonProgress = { quiz: parseEntries(value.quiz, parseQuizAnswer, isQuestionId) };
  const legacyQuiz = parseEntries(value.legacyQuiz, parseQuizAnswer, isQuestionNumberKey);
  if (Object.keys(legacyQuiz).length > 0) lesson.legacyQuiz = legacyQuiz;
  return lesson;
}

function parsePrologue(value: unknown): Progress['prologue'] {
  if (!isRecord(value) || typeof value.completedAt !== 'string') return undefined;
  return Number.isNaN(Date.parse(value.completedAt)) ? undefined : { completedAt: value.completedAt };
}

/**
 * Validates a record of the current version. Invalid fields (or lessons, or quiz answers, including
 * answers keyed by anything but a kebab-case id) are dropped rather than rejecting the whole record;
 * only a non-object or a wrong `version` yields `undefined`. Older versions go through `migrate`.
 */
export function parseProgress(value: unknown): Progress | undefined {
  if (!isRecord(value) || value.version !== PROGRESS_VERSION) return undefined;
  const progress: Progress = { version: 2, lessons: parseEntries(value.lessons, parseLesson) };
  if (isLens(value.lens)) progress.lens = value.lens;
  const prologue = parsePrologue(value.prologue);
  if (prologue) progress.prologue = prologue;
  return progress;
}
