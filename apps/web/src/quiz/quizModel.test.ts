import { describe, expect, it } from 'vitest';
import { emptyProgress, type Progress } from '../progress/index.ts';
import { lessonScore, lessonsWithProgress, optionLetter, questionStatus } from './quizModel.ts';

const answer = (solved: boolean) => ({ solved, lastAnswer: 0 });

describe('optionLetter', () => {
  it('maps indices to letters', () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('questionStatus', () => {
  const stored = (lastAnswer: number, correct: boolean) => ({ solved: correct, lastAnswer });

  it('distinguishes unanswered, correct and wrong', () => {
    expect(questionStatus(undefined, 1, 4)).toBe('unanswered');
    expect(questionStatus(stored(1, true), 1, 4)).toBe('correct');
    expect(questionStatus(stored(2, false), 1, 4)).toBe('wrong');
  });

  it('derives the status from the last answer, not the stored flag', () => {
    expect(questionStatus(stored(2, true), 1, 4)).toBe('wrong');
    expect(questionStatus(stored(1, false), 1, 4)).toBe('correct');
  });

  it('ignores a last answer outside the options', () => {
    expect(questionStatus(stored(7, true), 1, 4)).toBe('unanswered');
  });
});

const QUESTIONS = [
  { id: 'aes192-rounds', number: 1 },
  { id: 'input-byte-5-position', number: 2 },
  { id: 'final-round-omits', number: 3 },
];

describe('lessonScore', () => {
  it('counts solved and answered questions against the lesson total', () => {
    expect(lessonScore({ quiz: { 'aes192-rounds': answer(true), 'input-byte-5-position': answer(false) } }, QUESTIONS)).toEqual({ correct: 1, answered: 2, total: 3 });
  });

  it('keeps the point of a question solved earlier even if the latest attempt was wrong', () => {
    const retriedWrong = { solved: true, lastAnswer: 3 };
    expect(lessonScore({ quiz: { 'aes192-rounds': retriedWrong } }, QUESTIONS).correct).toBe(1);
  });

  it('is zero for a lesson without progress', () => {
    expect(lessonScore(undefined, QUESTIONS)).toEqual({ correct: 0, answered: 0, total: 3 });
  });

  it('ignores answers to questions the lesson no longer has', () => {
    expect(lessonScore({ quiz: { 'aes192-rounds': answer(true), removed: answer(true) } }, QUESTIONS.slice(0, 1))).toEqual({ correct: 1, answered: 1, total: 1 });
  });
});

describe('lessonsWithProgress', () => {
  const known = [{ key: 'symmetric/aes', title: 'AES', href: '/en/symmetric/aes/', questions: QUESTIONS }];

  it('keeps known lessons and appends unknown ones with results', () => {
    const progress: Progress = {
      ...emptyProgress(),
      lessons: { 'symmetric/aes': { quiz: {} }, 'future/lesson': { quiz: { 'new-question': answer(true) } }, 'empty/lesson': { quiz: {} } },
    };
    expect(lessonsWithProgress(known, progress)).toEqual([...known, { key: 'future/lesson', title: 'future/lesson', questions: [{ id: 'new-question', number: 0 }] }]);
  });

  it('lists every recorded answer of an unknown lesson, so its score counts them all', () => {
    const progress: Progress = { ...emptyProgress(), lessons: { 'future/lesson': { quiz: { a: answer(true), b: answer(false) } } } };
    const [lesson] = lessonsWithProgress([], progress);
    expect(lesson?.questions).toHaveLength(2);
    expect(lessonScore(progress.lessons['future/lesson'], lesson?.questions ?? [])).toEqual({ correct: 1, answered: 2, total: 2 });
  });
});
