import { describe, expect, it } from 'vitest';
import { EXCHANGE_FORMAT, exportProgress, importProgress } from './exchange.ts';
import type { Progress } from './schema.ts';

const progress: Progress = {
  version: 2,
  lens: 'cryptographer',
  prologue: { completedAt: '2026-10-02T10:00:00.000Z' },
  lessons: { 'symmetric/aes/subbytes-sbox': { quiz: { 'sbox-of-00': { solved: true, lastAnswer: 1 } }, legacyQuiz: { '2': { solved: false, lastAnswer: 0 } } } },
};

describe('exportProgress', () => {
  it('writes pretty JSON with the format marker', () => {
    const json = exportProgress(progress);
    expect(JSON.parse(json)).toMatchObject({ format: EXCHANGE_FORMAT, version: 2 });
    expect(json).toContain('\n  "version": 2');
  });
});

describe('importProgress', () => {
  it('round-trips an export', () => {
    expect(importProgress(exportProgress(progress))).toEqual({ ok: true, progress });
  });

  it('accepts a v1 export and migrates its answers to legacyQuiz', () => {
    const v1 = JSON.stringify({ format: EXCHANGE_FORMAT, version: 1, lens: 'story', lessons: { a: { quiz: { '1': { solved: true, lastAnswer: 1 } } } } });
    expect(importProgress(v1)).toEqual({ ok: true, progress: { version: 2, lens: 'story', lessons: { a: { quiz: {}, legacyQuiz: { '1': { solved: true, lastAnswer: 1 } } } } } });
  });

  it('rejects invalid JSON', () => {
    expect(importProgress('{nope')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it.each(['null', '[]', '{"version":1,"lessons":{}}', '{"format":"other","version":1}'])('rejects %s as wrong-format', (json) => {
    expect(importProgress(json)).toEqual({ ok: false, error: 'wrong-format' });
  });

  it.each([3, 0, '1', undefined])('rejects version %j as unsupported', (version) => {
    expect(importProgress(JSON.stringify({ format: EXCHANGE_FORMAT, version, lessons: {} }))).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('drops malformed fields of an otherwise valid file', () => {
    const json = JSON.stringify({ format: EXCHANGE_FORMAT, version: 2, lens: 'wizard', lessons: { a: { quiz: { ok: 'x', '1': { solved: true, lastAnswer: 0 } } } } });
    expect(importProgress(json)).toEqual({ ok: true, progress: { version: 2, lessons: { a: { quiz: {} } } } });
  });
});
