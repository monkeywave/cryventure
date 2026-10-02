import type { Lens } from '@cryventure/core';
import { isLens } from './lens.ts';

export type { Lens };

export const PROGRESS_VERSION = 1;

export interface QuizAnswer {
  /** Whether the latest attempt was correct. */
  correct: boolean;
  /** Answered correctly at least once; later wrong attempts keep it (the lesson score counts this). */
  solved: boolean;
  attempts: number;
  /** Index of the option the learner picked last. */
  lastAnswer: number;
}

export interface LessonProgress {
  /** Question number (as a string key) → the learner's answer state. */
  quiz: Record<string, QuizAnswer>;
}

export interface ProgressV1 {
  version: 1;
  lens?: Lens;
  prologue?: { completedAt: string };
  /** Lesson key (see `lessonKeyFromPath`) → progress in that lesson. */
  lessons: Record<string, LessonProgress>;
}

export function emptyProgress(): ProgressV1 {
  return { version: 1, lessons: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseQuizAnswer(value: unknown): QuizAnswer | undefined {
  if (!isRecord(value)) return undefined;
  const { correct, solved, attempts, lastAnswer } = value;
  if (typeof correct !== 'boolean' || !isCount(attempts) || !isCount(lastAnswer)) return undefined;
  return { correct, solved: solved === true, attempts, lastAnswer };
}

/** Keeps only well-formed entries of a record; anything else becomes `{}`. */
function parseEntries<T>(value: unknown, parseEntry: (entry: unknown) => T | undefined): Record<string, T> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).flatMap(([key, entry]) => {
    const parsed = parseEntry(entry);
    return parsed === undefined ? [] : [[key, parsed] as const];
  });
  return Object.fromEntries(entries);
}

function parseLesson(value: unknown): LessonProgress | undefined {
  return isRecord(value) ? { quiz: parseEntries(value.quiz, parseQuizAnswer) } : undefined;
}

function parsePrologue(value: unknown): ProgressV1['prologue'] {
  if (!isRecord(value) || typeof value.completedAt !== 'string') return undefined;
  return Number.isNaN(Date.parse(value.completedAt)) ? undefined : { completedAt: value.completedAt };
}

/**
 * Validates a version-1 record. Invalid fields (or lessons, or quiz answers) are dropped rather than
 * rejecting the whole record; only a non-object or a wrong `version` yields `undefined`.
 */
export function parseProgressV1(value: unknown): ProgressV1 | undefined {
  if (!isRecord(value) || value.version !== PROGRESS_VERSION) return undefined;
  const progress: ProgressV1 = { version: 1, lessons: parseEntries(value.lessons, parseLesson) };
  if (isLens(value.lens)) progress.lens = value.lens;
  const prologue = parsePrologue(value.prologue);
  if (prologue) progress.prologue = prologue;
  return progress;
}
