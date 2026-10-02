import { describe, expect, it } from 'vitest';
import { emptyProgress, type ProgressV1 } from '../progress/index.ts';
import { countCheckQuestions, lessonScore, lessonsWithProgress, optionLetter, questionStatus } from './quizModel.ts';

const answer = (solved: boolean) => ({ correct: solved, solved, attempts: 1, lastAnswer: 0 });

describe('optionLetter', () => {
  it('maps indices to letters', () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('questionStatus', () => {
  const stored = (lastAnswer: number, correct: boolean) => ({ correct, solved: correct, attempts: 1, lastAnswer });

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

describe('lessonScore', () => {
  it('counts solved and answered questions against the lesson total', () => {
    expect(lessonScore({ quiz: { 1: answer(true), 2: answer(false) } }, 3)).toEqual({ correct: 1, answered: 2, total: 3 });
  });

  it('keeps the point of a question solved earlier even if the latest attempt was wrong', () => {
    const retriedWrong = { correct: false, solved: true, attempts: 2, lastAnswer: 3 };
    expect(lessonScore({ quiz: { 1: retriedWrong } }, 2).correct).toBe(1);
  });

  it('is zero for a lesson without progress', () => {
    expect(lessonScore(undefined, 3)).toEqual({ correct: 0, answered: 0, total: 3 });
  });

  it('ignores answers to questions the lesson no longer has', () => {
    expect(lessonScore({ quiz: { 1: answer(true), 2: answer(true), 5: answer(false) } }, 1)).toEqual({ correct: 1, answered: 1, total: 1 });
  });
});

describe('lessonsWithProgress', () => {
  const known = [{ key: 'symmetric/aes', title: 'AES', href: '/en/symmetric/aes/', questionCount: 3 }];

  it('keeps known lessons and appends unknown ones with results', () => {
    const progress: ProgressV1 = {
      ...emptyProgress(),
      lessons: { 'symmetric/aes': { quiz: {} }, 'future/lesson': { quiz: { 1: answer(true) } }, 'empty/lesson': { quiz: {} } },
    };
    expect(lessonsWithProgress(known, progress)).toEqual([...known, { key: 'future/lesson', title: 'future/lesson', questionCount: 1 }]);
  });
});

describe('lessonsWithProgress question count', () => {
  it('uses the highest answered question number for unknown lessons, so their score counts every answer', () => {
    const progress: ProgressV1 = { ...emptyProgress(), lessons: { 'future/lesson': { quiz: { 3: answer(true) } } } };
    expect(lessonsWithProgress([], progress)[0]?.questionCount).toBe(3);
  });
});

describe('countCheckQuestions', () => {
  it('counts CheckQuestion elements, not imports', () => {
    const source = "import CheckQuestion from './CheckQuestion.astro';\n<CheckQuestion number={1} />\n<CheckQuestion\n number={2}>x</CheckQuestion>";
    expect(countCheckQuestions(source)).toBe(2);
    expect(countCheckQuestions(undefined)).toBe(0);
  });
});
