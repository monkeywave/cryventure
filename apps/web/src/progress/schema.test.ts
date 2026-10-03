import { describe, expect, it } from 'vitest';
import { emptyProgress, isQuestionId, parseProgress } from './schema.ts';

const answer = { solved: true, lastAnswer: 1 };

describe('emptyProgress', () => {
  it('is version 2 with no lessons, and a fresh object each call', () => {
    expect(emptyProgress()).toEqual({ version: 2, lessons: {} });
    expect(emptyProgress()).not.toBe(emptyProgress());
  });
});

describe('isQuestionId', () => {
  it.each(['ecb-penguin', 'rcon-10', 'aes192-rounds', 'x'])('accepts %j', (id) => {
    expect(isQuestionId(id)).toBe(true);
  });

  it.each(['', '1x-', '1', '3des-rounds', 'Ecb', 'ecb_penguin', 'ecb--penguin', '-ecb', 'ecb penguin', '#1', 1, undefined])('rejects %j', (id) => {
    expect(isQuestionId(id)).toBe(false);
  });
});

describe('parseProgress', () => {
  it('accepts a complete record', () => {
    const record = {
      version: 2,
      lens: 'story',
      prologue: { completedAt: '2026-01-02T03:04:05.000Z' },
      lessons: { 'a/b': { quiz: { 'ecb-penguin': answer } } },
    };
    expect(parseProgress(record)).toEqual(record);
  });

  it.each([null, 'x', 42, [], { version: 1, lessons: {} }, { version: 3, lessons: {} }, { lessons: {} }])('rejects %j', (value) => {
    expect(parseProgress(value)).toBeUndefined();
  });

  it('drops an unknown lens and an invalid prologue', () => {
    expect(parseProgress({ version: 2, lens: 'wizard', prologue: { completedAt: 'not a date' }, lessons: {} })).toEqual(emptyProgress());
  });

  it('drops malformed lessons and quiz answers but keeps valid siblings', () => {
    const parsed = parseProgress({
      version: 2,
      lessons: {
        good: { quiz: { one: answer, two: { solved: true }, three: { ...answer, lastAnswer: -1 } } },
        bad: 'nope',
        noQuiz: {},
      },
    });
    expect(parsed?.lessons).toEqual({ good: { quiz: { one: answer } }, noQuiz: { quiz: {} } });
  });

  it('drops quiz answers keyed by anything but a kebab-case id', () => {
    const parsed = parseProgress({ version: 2, lessons: { a: { quiz: { '1': answer, Bad_Id: answer, 'ok-id': answer } } } });
    expect(parsed?.lessons.a?.quiz).toEqual({ 'ok-id': answer });
  });

  it('strips unknown lesson fields', () => {
    expect(parseProgress({ version: 2, lessons: { a: { quiz: {}, legacyQuiz: { '1': answer } } } })?.lessons).toEqual({ a: { quiz: {} } });
  });

  it('derives solved = false when the field is missing or malformed', () => {
    const parsed = parseProgress({ version: 2, lessons: { a: { quiz: { one: { lastAnswer: 0 }, two: { ...answer, solved: 'yes' } } } } });
    expect(parsed?.lessons.a?.quiz).toEqual({ one: { solved: false, lastAnswer: 0 }, two: { ...answer, solved: false } });
  });

  it('derives solved from the correct flag of early records, dropping obsolete fields', () => {
    const parsed = parseProgress({ version: 2, lessons: { a: { quiz: { one: { correct: true, attempts: 1, lastAnswer: 0 }, two: { correct: false, solved: true, attempts: 3, lastAnswer: 2 } } } } });
    expect(parsed?.lessons.a?.quiz).toEqual({ one: { solved: true, lastAnswer: 0 }, two: { solved: true, lastAnswer: 2 } });
  });

  it('replaces non-object lessons with an empty record and strips unknown fields', () => {
    expect(parseProgress({ version: 2, lessons: [], extra: true })).toEqual(emptyProgress());
  });
});
