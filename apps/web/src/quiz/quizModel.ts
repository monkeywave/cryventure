import type { LessonProgress, ProgressV1, QuizAnswer } from '../progress/index.ts';

/** Option label for a zero-based index: 0 → "A", 1 → "B", … */
export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Where a question stands for the learner: never checked, or the result of the last check. */
export type QuestionStatus = 'unanswered' | 'correct' | 'wrong';

/** Whether a stored option index points at one of the question's options. */
export function isOptionIndex(index: number | undefined, optionCount: number): index is number {
  return index !== undefined && index < optionCount;
}

/**
 * Derived from the stored last answer against the question's actual answer (the stored `correct`
 * flag may be stale or hand-edited); a last answer outside the options counts as unanswered.
 */
export function questionStatus(stored: QuizAnswer | undefined, answer: number, optionCount: number): QuestionStatus {
  if (!isOptionIndex(stored?.lastAnswer, optionCount)) return 'unanswered';
  return stored.lastAnswer === answer ? 'correct' : 'wrong';
}

/** A lesson with check questions, as the progress page lists it (built server-side). */
export interface QuizLesson {
  /** See `lessonKeyFromPath`. */
  key: string;
  title: string;
  href?: string;
  questionCount: number;
}

export interface LessonScore {
  correct: number;
  answered: number;
  total: number;
}

/** Questions count once solved (see `QuizAnswer.solved`); answers to question numbers beyond `questionCount` are ignored. */
export function lessonScore(lesson: LessonProgress | undefined, questionCount: number): LessonScore {
  const answers = Object.entries(lesson?.quiz ?? {})
    .filter(([questionNumber]) => Number(questionNumber) <= questionCount)
    .map(([, answer]) => answer);
  const correct = answers.filter((answer) => answer.solved).length;
  return { correct, answered: answers.length, total: questionCount };
}

function highestQuestionNumber(lesson: LessonProgress): number {
  return Math.max(0, ...Object.keys(lesson.quiz).map(Number).filter(Number.isSafeInteger));
}

/**
 * The known lessons in their given order, followed by lessons that only appear in the progress
 * (e.g. imported from a newer site version), titled by their key.
 */
export function lessonsWithProgress(known: readonly QuizLesson[], progress: ProgressV1): QuizLesson[] {
  const knownKeys = new Set(known.map((lesson) => lesson.key));
  const extra = Object.entries(progress.lessons)
    .filter(([key, lesson]) => !knownKeys.has(key) && Object.keys(lesson.quiz).length > 0)
    .map(([key, lesson]) => ({ key, title: key, questionCount: highestQuestionNumber(lesson) }));
  return [...known, ...extra];
}

/** Number of `<CheckQuestion` elements in an MDX source. */
export function countCheckQuestions(mdxSource: string | undefined): number {
  return mdxSource?.match(/<CheckQuestion\b/g)?.length ?? 0;
}
