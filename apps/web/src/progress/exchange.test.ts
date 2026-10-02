import { describe, expect, it } from 'vitest';
import { EXCHANGE_FORMAT, exportProgress, importProgress } from './exchange.ts';
import type { ProgressV1 } from './schema.ts';

const progress: ProgressV1 = {
  version: 1,
  lens: 'cryptographer',
  prologue: { completedAt: '2026-10-02T10:00:00.000Z' },
  lessons: { 'symmetric/aes/subbytes-sbox': { quiz: { '1': { correct: true, solved: true, attempts: 2, lastAnswer: 1 } } } },
};

describe('exportProgress', () => {
  it('writes pretty JSON with the format marker', () => {
    const json = exportProgress(progress);
    expect(JSON.parse(json)).toMatchObject({ format: EXCHANGE_FORMAT, version: 1 });
    expect(json).toContain('\n  "version": 1');
  });
});

describe('importProgress', () => {
  it('round-trips an export', () => {
    expect(importProgress(exportProgress(progress))).toEqual({ ok: true, progress });
  });

  it('rejects invalid JSON', () => {
    expect(importProgress('{nope')).toEqual({ ok: false, error: 'invalid-json' });
  });

  it.each(['null', '[]', '{"version":1,"lessons":{}}', '{"format":"other","version":1}'])('rejects %s as wrong-format', (json) => {
    expect(importProgress(json)).toEqual({ ok: false, error: 'wrong-format' });
  });

  it.each([2, 0, '1', undefined])('rejects version %j as unsupported', (version) => {
    expect(importProgress(JSON.stringify({ format: EXCHANGE_FORMAT, version, lessons: {} }))).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('drops malformed fields of an otherwise valid file', () => {
    const json = JSON.stringify({ format: EXCHANGE_FORMAT, version: 1, lens: 'wizard', lessons: { a: { quiz: { '1': 'x' } } } });
    expect(importProgress(json)).toEqual({ ok: true, progress: { version: 1, lessons: { a: { quiz: {} } } } });
  });
});
