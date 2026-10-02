import { describe, expect, it } from 'vitest';
import { emptyProgress, parseProgressV1 } from './schema.ts';

const answer = { correct: true, solved: true, attempts: 2, lastAnswer: 1 };

describe('emptyProgress', () => {
  it('is version 1 with no lessons, and a fresh object each call', () => {
    expect(emptyProgress()).toEqual({ version: 1, lessons: {} });
    expect(emptyProgress()).not.toBe(emptyProgress());
  });
});

describe('parseProgressV1', () => {
  it('accepts a complete record', () => {
    const record = { version: 1, lens: 'story', prologue: { completedAt: '2026-01-02T03:04:05.000Z' }, lessons: { 'a/b': { quiz: { '1': answer } } } };
    expect(parseProgressV1(record)).toEqual(record);
  });

  it.each([null, 'x', 42, [], { version: 2, lessons: {} }, { lessons: {} }])('rejects %j', (value) => {
    expect(parseProgressV1(value)).toBeUndefined();
  });

  it('drops an unknown lens and an invalid prologue', () => {
    expect(parseProgressV1({ version: 1, lens: 'wizard', prologue: { completedAt: 'not a date' }, lessons: {} })).toEqual(emptyProgress());
  });

  it('drops malformed lessons and quiz answers but keeps valid siblings', () => {
    const parsed = parseProgressV1({
      version: 1,
      lessons: {
        good: { quiz: { '1': answer, '2': { correct: 'yes', attempts: 1, lastAnswer: 0 }, '3': { ...answer, attempts: -1 } } },
        bad: 'nope',
        noQuiz: {},
      },
    });
    expect(parsed?.lessons).toEqual({ good: { quiz: { '1': answer } }, noQuiz: { quiz: {} } });
  });

  it('derives solved = false when the field is missing or malformed', () => {
    const parsed = parseProgressV1({ version: 1, lessons: { a: { quiz: { '1': { correct: true, attempts: 1, lastAnswer: 0 }, '2': { ...answer, solved: 'yes' } } } } });
    expect(parsed?.lessons.a?.quiz).toEqual({ '1': { correct: true, solved: false, attempts: 1, lastAnswer: 0 }, '2': { ...answer, solved: false } });
  });

  it('replaces non-object lessons with an empty record and strips unknown fields', () => {
    expect(parseProgressV1({ version: 1, lessons: [], extra: true })).toEqual(emptyProgress());
  });
});
