import { describe, expect, it } from 'vitest';
import { isSupportedVersion, migrate, migrateV1ToV2 } from './migrations.ts';
import { emptyProgress } from './schema.ts';

const answer = { solved: false, lastAnswer: 3 };

describe('migrate', () => {
  it.each([undefined, null, 'garbage', 7, [], {}, { version: '1' }, { version: 0 }, { version: 1.5 }])('turns %j into empty progress', (raw) => {
    expect(migrate(raw)).toEqual(emptyProgress());
  });

  it('returns empty progress for a future version', () => {
    expect(migrate({ version: 99, lessons: { a: { quiz: {} } } })).toEqual(emptyProgress());
  });

  it('validates a current-version record', () => {
    const record = { version: 2, lens: 'cryptographer', lessons: { a: { quiz: { 'ecb-penguin': answer }, legacyQuiz: { '2': answer } } } };
    expect(migrate(record)).toEqual(record);
  });

  it('upgrades a v1 record: number-keyed answers move to legacyQuiz', () => {
    const v1 = { version: 1, lens: 'story', lessons: { a: { quiz: { '1': answer, '2': { correct: true, attempts: 1, lastAnswer: 0 } } }, empty: { quiz: {} } } };
    expect(migrate(v1)).toEqual({
      version: 2,
      lens: 'story',
      lessons: { a: { quiz: {}, legacyQuiz: { '1': answer, '2': { solved: true, lastAnswer: 0 } } }, empty: { quiz: {} } },
    });
  });
});

describe('migrateV1ToV2', () => {
  it('bumps the version and moves each lesson quiz to legacyQuiz', () => {
    expect(migrateV1ToV2({ version: 1, lessons: { a: { quiz: { '1': answer } } } })).toEqual({ version: 2, lessons: { a: { quiz: {}, legacyQuiz: { '1': answer } } } });
  });

  it('leaves malformed lessons for the parser to drop', () => {
    expect(migrateV1ToV2({ version: 1, lessons: { a: 'nope' } })).toEqual({ version: 2, lessons: { a: 'nope' } });
    expect(migrateV1ToV2({ version: 1, lessons: 'nope' })).toEqual({ version: 2, lessons: 'nope' });
  });
});

describe('isSupportedVersion', () => {
  it('accepts v1 and v2 only', () => {
    expect(isSupportedVersion({ version: 1 })).toBe(true);
    expect(isSupportedVersion({ version: 2 })).toBe(true);
    expect(isSupportedVersion({ version: 3 })).toBe(false);
    expect(isSupportedVersion({})).toBe(false);
    expect(isSupportedVersion('1')).toBe(false);
  });
});
