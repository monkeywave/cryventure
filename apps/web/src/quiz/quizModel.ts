import { type LessonProgress, type Progress, type QuizAnswer, type QuizQuestionRef } from '../progress/index.ts';

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
 * Derived from the stored last answer against the question's actual answer (so a changed question
 * or a hand-edited record cannot disagree); a last answer outside the options counts as unanswered.
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
  /** The lesson's questions, from its MDX source (see `extractCheckQuestions`). */
  questions: readonly QuizQuestionRef[];
}

export interface LessonScore {
  correct: number;
  answered: number;
  total: number;
}

/** Questions count once solved (see `QuizAnswer.solved`); answers to questions not listed are ignored. */
export function lessonScore(lesson: LessonProgress | undefined, questions: readonly QuizQuestionRef[]): LessonScore {
  const answers = questions.map((question) => lesson?.quiz[question.id]).filter((answer) => answer !== undefined);
  const correct = answers.filter((answer) => answer.solved).length;
  return { correct, answered: answers.length, total: questions.length };
}

/** One question per recorded answer, for a lesson this site version does not know (number 0: unknown). */
function recordedQuestions(lesson: LessonProgress): QuizQuestionRef[] {
  return Object.keys(lesson.quiz).map((id) => ({ id, number: 0 }));
}

/**
 * The known lessons in their given order, followed by lessons that only appear in the progress
 * (e.g. imported from a newer site version), titled by their key.
 */
export function lessonsWithProgress(known: readonly QuizLesson[], progress: Progress): QuizLesson[] {
  const knownKeys = new Set(known.map((lesson) => lesson.key));
  const extra = Object.entries(progress.lessons)
    .map(([key, lesson]) => ({ key, title: key, questions: recordedQuestions(lesson) }))
    .filter((lesson) => !knownKeys.has(lesson.key) && lesson.questions.length > 0);
  return [...known, ...extra];
}
