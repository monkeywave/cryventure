import { useState } from 'react';
import { recordQuizAnswer, useProgress } from '../../progress/index.ts';
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
 * selection or retries; checking records the answer (correct or not) in progress.
 */
export function useQuizQuestion(lessonKey: string, questionNumber: number, answer: number, optionCount: number): QuizQuestionState {
  const stored = useProgress((progress) => progress.lessons[lessonKey]?.quiz[String(questionNumber)]);
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
    recordQuizAnswer(lessonKey, questionNumber, selected, selected === answer);
    setDraft(undefined);
  };
  const retry = (): void => {
    setDraft({ selected: undefined });
    setRevealed(false);
    setNeedsSelection(false);
  };

  return { selected, status, needsSelection, revealed, explained: revealed || status === 'correct', select, check, reveal: () => setRevealed(true), retry };
}
