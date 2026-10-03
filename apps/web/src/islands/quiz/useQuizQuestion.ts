import { useState } from 'react';
import { recordQuizAnswer, resolveQuizAnswer, useProgress, type QuizQuestionRef } from '../../progress/index.ts';
import { isOptionIndex, questionStatus, type QuestionStatus } from '../../quiz/quizModel.ts';

export interface QuizQuestionState {
  /** Option the learner has selected (restored from progress on load). */
  selected: number | undefined;
  /** Result of the last check, or `unanswered` while the learner is (re)answering. */
  status: QuestionStatus;
  /** Set when "Check" was pressed without a selection. */
  needsSelection: boolean;
  /** The answer and explanation are visible (after a correct answer or "Show answer"). */
  explained: boolean;
  revealed: boolean;
  select: (index: number) => void;
  check: () => void;
  reveal: () => void;
  retry: () => void;
}

/**
 * One check question backed by progress. The stored answer is shown until the learner changes the
 * selection or retries; checking records the answer (correct or not) in progress, but an answer checked
 * after "Show answer" never marks the question solved (one solved earlier stays solved). The stored answer
 * is found by id, else by the v1 question number (`resolveQuizAnswer`); recording moves it to the id.
 */
export function useQuizQuestion(lessonKey: string, question: QuizQuestionRef, answer: number, optionCount: number): QuizQuestionState {
  const stored = useProgress((progress) => resolveQuizAnswer(progress.lessons[lessonKey], question));
  const [draft, setDraft] = useState<{ selected: number | undefined } | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);

  const lastAnswer = stored?.lastAnswer;
  const storedAnswer = isOptionIndex(lastAnswer, optionCount) ? lastAnswer : undefined;
  const selected = draft === undefined ? storedAnswer : draft.selected;
  const status = draft === undefined ? questionStatus(stored, answer, optionCount) : 'unanswered';

  const select = (index: number): void => {
    setDraft({ selected: index });
    setNeedsSelection(false);
  };
  const check = (): void => {
    if (selected === undefined) return setNeedsSelection(true);
    // A correct answer only counts as solved when the learner found it without "Show answer".
    recordQuizAnswer(lessonKey, question, selected, selected === answer && !revealed);
    setDraft(undefined);
  };
  const retry = (): void => {
    setDraft({ selected: undefined });
    setRevealed(false);
    setNeedsSelection(false);
  };

  return { selected, status, needsSelection, revealed, explained: revealed || status === 'correct', select, check, reveal: () => setRevealed(true), retry };
}
