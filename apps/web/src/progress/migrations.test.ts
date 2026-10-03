import { describe, expect, it } from 'vitest';
import { isSupportedVersion, LEGACY_QUIZ_IDS, migrate, migrateV1ToV2 } from './migrations.ts';
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
    const record = { version: 2, lens: 'cryptographer', lessons: { a: { quiz: { 'ecb-penguin': answer } } } };
    expect(migrate(record)).toEqual(record);
  });

  it('upgrades a v1 record: number-keyed answers move to their frozen ids', () => {
    const v1 = { version: 1, lens: 'story', lessons: { 'foundations/xor': { quiz: { '1': answer, '2': { correct: true, attempts: 1, lastAnswer: 0 } } }, 'symmetric/aes': { quiz: {} } } };
    expect(migrate(v1)).toEqual({
      version: 2,
      lens: 'story',
      lessons: { 'foundations/xor': { quiz: { 'xor-with-ff': answer, 'two-time-pad': { solved: true, lastAnswer: 0 } } }, 'symmetric/aes': { quiz: {} } },
    });
  });
});

describe('migrateV1ToV2', () => {
  it('bumps the version and keys each answer by the id its v1 number had', () => {
    expect(migrateV1ToV2({ version: 1, lessons: { 'symmetric/aes/key-expansion': { quiz: { '2': answer } } } })).toEqual({
      version: 2,
      lessons: { 'symmetric/aes/key-expansion': { quiz: { 'rcon-10': answer } } },
    });
  });

  it('maps by the frozen v1 numbering, so renumbering a question later cannot move answers', () => {
    expect(LEGACY_QUIZ_IDS['symmetric/aes/subbytes-sbox']).toEqual({ '1': 'sbox-of-00', '2': 'sbox-fixed-points', '3': 'sbox-nonlinearity' });
  });

  it('drops answers under unknown numbers and lessons without v1 questions', () => {
    const v1 = { version: 1, lessons: { 'foundations/xor': { quiz: { '3': answer, '9': answer, x: answer } }, 'unknown/lesson': { quiz: { '1': answer } } } };
    expect(migrateV1ToV2(v1)).toEqual({ version: 2, lessons: { 'foundations/xor': { quiz: { 'otp-possible-plaintexts': answer } }, 'unknown/lesson': { quiz: {} } } });
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
